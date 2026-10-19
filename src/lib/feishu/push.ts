import { prisma } from "@/lib/prisma";
import { getDocument } from "@/lib/documents";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { hasFeishuWriteScopes } from "./config";
import { getFeishuAccessToken } from "./oauth";
import {
  createDocDescendants,
  createWikiDocNode,
  deleteDocChildren,
  fillImageBlock,
  getWikiNode,
  listDocBlocks,
  renameWikiNode,
  uploadFeishuMedia,
} from "./api";
import {
  collectSubtree,
  markdownToFeishuBlocks,
  subtreeSize,
  type MdBuild,
  type OutBlock,
} from "./mdToBlocks";
import { tk } from "@/i18n/t";

/**
 * xedit article → Feishu wiki (push / write back).
 * Linked articles (imported or pushed before) overwrite the whole Feishu source document; unlinked ones get a new node at the root
 * of the last synced wiki space. Before writing back, obj_edit_time is compared for conflict detection; afterwards the new edit time is recorded in
 * FeishuDocLink so the next pull doesn't treat what we just pushed as a Feishu-side change and pull it back.
 */

export type PushResult =
  | { ok: true; action: "created" | "updated"; imageFailed: number }
  | { needWriteAuth: true }
  | { conflict: true }
  | { error: string };

/** Max blocks per create call (official limit is 50, leaving headroom) */
const BATCH_BLOCKS = 45;
/** Max blocks per document: reject overly long articles outright rather than stall the request with hundreds of write calls */
const MAX_BLOCKS = 2000;
/** Max bytes per image (Feishu asset limit is 20MB) */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch image sources safely: http(s) only, null on download failure (the block degrades to a link) */
async function fetchImage(url: string): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;
    const mime = (res.headers.get("content-type") ?? "image/png").split(";")[0].trim();
    return mime.startsWith("image/") ? { buffer: buf, mime } : null;
  } catch {
    return null;
  }
}

/** Replace placeholder blocks for undownloadable images with link paragraphs, so no empty images show up in Feishu */
function degradeImage(build: MdBuild, blockId: string, url: string, alt: string): void {
  const block = build.blocks.get(blockId);
  if (!block) return;
  delete block.image;
  block.block_type = 2;
  block.text = {
    elements: [
      {
        text_run: {
          content: alt || "图片", // i18n-ignore image alt text pushed to Feishu, it's content
          text_element_style: { link: { url: encodeURIComponent(url) } },
        },
      },
    ],
  };
}

/** Batch top-level blocks by subtree size and write each batch via the create API */
async function writeBlocks(
  token: string,
  feishuDocId: string,
  pageBlockId: string,
  build: MdBuild
): Promise<void> {
  let index = 0;
  let batchIds: string[] = [];
  let batchSize = 0;
  const flush = async () => {
    if (batchIds.length === 0) return;
    const descendants: OutBlock[] = [];
    for (const id of batchIds) collectSubtree(build, id, descendants);
    await createDocDescendants(token, feishuDocId, pageBlockId, index, batchIds, descendants);
    index += batchIds.length;
    batchIds = [];
    batchSize = 0;
  };
  for (const id of build.children) {
    const size = subtreeSize(build, id);
    if (batchSize > 0 && batchSize + size > BATCH_BLOCKS) await flush();
    batchIds.push(id);
    batchSize += size;
  }
  await flush();
}

/** Upload downloaded images as Feishu assets and fill in the image blocks. Failures are counted without aborting the whole push */
async function fillImages(
  token: string,
  feishuDocId: string,
  build: MdBuild,
  media: Map<string, { buffer: Buffer; mime: string }>
): Promise<number> {
  if (build.images.length === 0) return 0;
  // Real ids of the empty image blocks are taken in order from the page's top-level children: we just wrote the whole doc, so order is reliable
  const blocks = await listDocBlocks(token, feishuDocId);
  const page = blocks.find((b) => b.block_type === 1);
  const map = new Map(blocks.map((b) => [b.block_id, b]));
  const realImageIds = (page?.children ?? []).filter(
    (id) => map.get(id)?.block_type === 27
  );
  let failed = 0;
  for (let i = 0; i < build.images.length; i++) {
    const m = media.get(build.images[i].blockId);
    const realId = realImageIds[i];
    if (!m || !realId) {
      failed++;
      continue;
    }
    try {
      const fileToken = await uploadFeishuMedia(token, m.buffer, m.mime, realId);
      await fillImageBlock(token, feishuDocId, realId, fileToken);
    } catch {
      failed++;
    }
  }
  return failed;
}

export async function pushDocumentToFeishu(
  userId: string,
  documentId: string,
  force: boolean
): Promise<PushResult> {
  const conn = await prisma.feishuConnection.findUnique({ where: { userId } });
  if (!conn || !conn.accessTokenEnc) return { error: tk("请先在「飞书知识库导入」里连接飞书") };
  if (!hasFeishuWriteScopes(conn.scopes)) return { needWriteAuth: true };

  const doc = await getDocument(userId, documentId);
  if (!doc) return { error: tk("文章不存在") };
  const title = doc.title.trim() || UNTITLED_DOC;

  const build = markdownToFeishuBlocks(doc.content);
  if (build.blocks.size > MAX_BLOCKS) {
    return { error: `文章过长（超过 ${MAX_BLOCKS} 个内容块），暂不支持推送` }; // i18n-ignore server error message with variables; client-side t() can't match it, keep Chinese for now
  }
  // Pre-download all images first: ones that can't be fetched degrade to links before blocks are created, so no empty images are left in Feishu
  const media = new Map<string, { buffer: Buffer; mime: string }>();
  for (const spec of [...build.images]) {
    const m = await fetchImage(spec.url);
    if (m) {
      media.set(spec.blockId, m);
    } else {
      degradeImage(build, spec.blockId, spec.url, spec.alt);
      build.images.splice(build.images.indexOf(spec), 1);
    }
  }

  const token = await getFeishuAccessToken(userId);
  const link = await prisma.feishuDocLink.findFirst({ where: { userId, documentId } });

  let nodeToken: string;
  let feishuDocId: string;
  let action: "created" | "updated";

  if (link) {
    const node = await getWikiNode(token, link.nodeToken).catch(() => null);
    if (!node) {
      return { error: tk("飞书侧找不到原文档（可能已被删除或移出知识库）") };
    }
    if (!force && node.objEditTime !== link.objEditTime) return { conflict: true };
    nodeToken = link.nodeToken;
    feishuDocId = node.objToken;
    action = "updated";
    if (node.title !== title) {
      await renameWikiNode(token, node.spaceId, nodeToken, title).catch(() => {});
    }
  } else {
    if (!conn.spaceId) {
      return { error: tk("还没选过目标知识库：请先在「飞书知识库导入」里选择知识库（同步一次即可记住）") };
    }
    const created = await createWikiDocNode(token, conn.spaceId, title);
    nodeToken = created.nodeToken;
    feishuDocId = created.objToken;
    action = "created";
  }

  // Full overwrite: clear the existing body, then write
  const existing = await listDocBlocks(token, feishuDocId);
  const page = existing.find((b) => b.block_type === 1);
  if (!page) return { error: tk("读取飞书文档结构失败") };
  const childCount = page.children?.length ?? 0;
  if (childCount > 0) await deleteDocChildren(token, feishuDocId, page.block_id, childCount);
  await writeBlocks(token, feishuDocId, page.block_id, build);
  const imageFailed = await fillImages(token, feishuDocId, build, media);

  // Read back the edit time into the link to prevent echo; Feishu's update timestamp lags, so wait a bit before reading
  await sleep(2000);
  const after = await getWikiNode(token, nodeToken).catch(() => null);
  await prisma.feishuDocLink.upsert({
    where: { userId_nodeToken: { userId, nodeToken } },
    update: { objEditTime: after?.objEditTime ?? "" },
    create: {
      userId,
      nodeToken,
      documentId,
      objEditTime: after?.objEditTime ?? "",
      origin: "push",
    },
  });
  return { ok: true, action, imageFailed };
}
