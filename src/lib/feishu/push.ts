import { prisma } from "@/lib/prisma";
import { getDocument } from "@/lib/documents";
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

/**
 * xedit 文章 → 飞书知识库（推送/写回）。
 * 已关联（导入或推送过）的文章整篇覆盖飞书原文档；未关联的在上次同步的知识空间
 * 根下新建节点。写回前比对 obj_edit_time 做冲突检查；写完把新的编辑时间记回
 * FeishuDocLink，防止下次拉取把自己刚推的内容当成飞书改动拉回来。
 */

export type PushResult =
  | { ok: true; action: "created" | "updated"; imageFailed: number }
  | { needWriteAuth: true }
  | { conflict: true }
  | { error: string };

/** 单次创建调用的块数上限（官方限制 50，留余量） */
const BATCH_BLOCKS = 45;
/** 全文块数上限：超长文章直接拒绝，避免几百次写调用把请求拖死 */
const MAX_BLOCKS = 2000;
/** 单图字节上限（飞书素材上限 20MB） */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 拉平安全的图片源：仅 http(s)，下载失败返回 null（对应块降级为链接） */
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

/** 下载不了的图片占位块换成链接段落，别让飞书里出现空图 */
function degradeImage(build: MdBuild, blockId: string, url: string, alt: string): void {
  const block = build.blocks.get(blockId);
  if (!block) return;
  delete block.image;
  block.block_type = 2;
  block.text = {
    elements: [
      {
        text_run: {
          content: alt || "图片",
          text_element_style: { link: { url: encodeURIComponent(url) } },
        },
      },
    ],
  };
}

/** 顶层块按子树规模分批，逐批调创建接口写入 */
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

/** 已下载好的图片上传为飞书素材并回填 image 块。失败计数，不中断整体 */
async function fillImages(
  token: string,
  feishuDocId: string,
  build: MdBuild,
  media: Map<string, { buffer: Buffer; mime: string }>
): Promise<number> {
  if (build.images.length === 0) return 0;
  // 空 image 块的真实 id 从页面顶层子块里按序取：整篇是我们刚写的，顺序可靠
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
  if (!conn || !conn.accessTokenEnc) return { error: "请先在「飞书知识库导入」里连接飞书" };
  if (!hasFeishuWriteScopes(conn.scopes)) return { needWriteAuth: true };

  const doc = await getDocument(userId, documentId);
  if (!doc) return { error: "文章不存在" };
  const title = doc.title.trim() || "未命名文章";

  const build = markdownToFeishuBlocks(doc.content);
  if (build.blocks.size > MAX_BLOCKS) {
    return { error: `文章过长（超过 ${MAX_BLOCKS} 个内容块），暂不支持推送` };
  }
  // 图片先全部预下载：拉不到的在建块前降级成链接，不会在飞书里留下空图
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
      return { error: "飞书侧找不到原文档（可能已被删除或移出知识库）" };
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
      return { error: "还没选过目标知识库：请先在「飞书知识库导入」里选择知识库（同步一次即可记住）" };
    }
    const created = await createWikiDocNode(token, conn.spaceId, title);
    nodeToken = created.nodeToken;
    feishuDocId = created.objToken;
    action = "created";
  }

  // 整篇覆盖：清空现有正文再写入
  const existing = await listDocBlocks(token, feishuDocId);
  const page = existing.find((b) => b.block_type === 1);
  if (!page) return { error: "读取飞书文档结构失败" };
  const childCount = page.children?.length ?? 0;
  if (childCount > 0) await deleteDocChildren(token, feishuDocId, page.block_id, childCount);
  await writeBlocks(token, feishuDocId, page.block_id, build);
  const imageFailed = await fillImages(token, feishuDocId, build, media);

  // 回读编辑时间记入关联，防回声；飞书更新时间戳有延迟，稍等再读
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
