import { prisma } from "@/lib/prisma";
import { createDocument, updateDocument } from "@/lib/documents";
import { uploadMediaBuffer } from "@/lib/assets";
import { ossConfigured } from "@/lib/oss";
import { IMAGE_EXT } from "@/lib/media";
import { getFeishuAccessToken } from "./oauth";
import {
  downloadFeishuMedia,
  listAllWikiNodes,
  listDocBlocks,
  type WikiNode,
} from "./api";
import { feishuBlocksToMarkdown, feishuImageTokens } from "./markdown";
import { tk } from "@/i18n/t";

/**
 * Batched incremental sync from wiki → xedit.
 * Each call handles only a small batch of documents and returns progress (HTTP requests can't run too long); the client loops until done.
 * Idempotency relies on obj_edit_time recorded in FeishuDocLink — documents unchanged on the Feishu side are skipped entirely.
 */

/** Max documents and time budget per batch: stop at whichever comes first, finishing at least 1 doc to guarantee progress */
const BATCH_DOCS = 5;
const TIME_BUDGET_MS = 20000;

export interface SyncBatchResult {
  done: boolean;
  total: number;
  pending: number;
  created: number;
  updated: number;
  skipped: number;
  unsupported: number;
  failed: { nodeToken: string; title: string; reason: string }[];
  /** Documents actually written in this batch, for the frontend progress list */
  items: { title: string; action: "created" | "updated" }[];
  /** Title of the next document to process: while the next batch runs, the frontend shows 「正在同步 X」 (Syncing X) */
  nextUp: string[];
}

/** Root of the imported category tree: articles still under this subtree follow the Feishu hierarchy; moving one out counts as the user claiming it */
const ROOT_CAT = "飞书知识库"; // i18n-ignore category name stored by sync, it's data

/** Hierarchy → category path: `飞书知识库/space name/ancestors…`, slashes within segments are replaced, overly deep levels dropped */
function buildCategory(spaceName: string, path: string[]): string {
  const segs = [spaceName, ...path]
    .map((s) => s.replaceAll("/", "／").trim().slice(0, 24)) // i18n-ignore path separator replacement, it's data
    .filter(Boolean);
  let out = ROOT_CAT;
  for (const seg of segs) {
    if (out.length + 1 + seg.length > 100) break;
    out += `/${seg}`;
  }
  return out;
}

/** Whether the article is still under the 「飞书知识库」 (Feishu wiki) mirror subtree */
const inMirrorTree = (cat: string): boolean => cat === ROOT_CAT || cat.startsWith(`${ROOT_CAT}/`);

/** Image re-hosting: each Feishu asset is stored only once (reused by source); give up directly when OSS isn't configured */
function makeImageResolver(userId: string, token: string) {
  /** fileToken → usable URL; null = confirmed unavailable in this sync, don't retry */
  const cache = new Map<string, string | null>();
  /** fileTokens already looked up in the DB (hit or miss); resolve uses this to skip per-image queries */
  const looked = new Set<string>();

  /**
   * Pre-warm before converting: look up all assets used by this doc in one findMany.
   * Previously each image did its own findFirst, so a doc with dozens of images meant dozens of round trips (N+1).
   * Pre-warm failure isn't an error — resolve falls back to per-image lookups, just slower.
   */
  async function prime(fileTokens: string[]): Promise<void> {
    if (!ossConfigured()) return;
    const missing = fileTokens.filter((t) => !looked.has(t));
    if (missing.length === 0) return;
    try {
      const rows = await prisma.asset.findMany({
        where: { userId, source: { in: missing.map((t) => `feishu:${t}`) } },
        select: { source: true, url: true },
      });
      const urlOf = new Map(rows.map((r) => [r.source, r.url]));
      for (const t of missing) {
        looked.add(t);
        const url = urlOf.get(`feishu:${t}`);
        // Don't cache misses (that would mean "confirmed unavailable"); leave them for resolve to download
        if (url) cache.set(t, url);
      }
    } catch {
      /* ignore */
    }
  }

  async function resolve(fileToken: string): Promise<string | null> {
    if (cache.has(fileToken)) return cache.get(fileToken)!;
    let url: string | null = null;
    if (ossConfigured()) {
      const source = `feishu:${fileToken}`;
      try {
        // Tokens primed already go straight to download (hits are already in the cache); only un-primed ones get a fallback lookup
        const existing = looked.has(fileToken)
          ? null
          : await prisma.asset.findFirst({ where: { userId, source }, select: { url: true } });
        if (existing) {
          url = existing.url;
        } else {
          const media = await downloadFeishuMedia(token, fileToken);
          if (media.mime in IMAGE_EXT) {
            url = (await uploadMediaBuffer(userId, media.buffer, media.mime, source)).url;
          }
        }
      } catch {
        url = null; // one failed image doesn't sink the whole doc: placeholder text goes into the body
      }
    }
    cache.set(fileToken, url);
    return url;
  }

  return { prime, resolve };
}

export async function syncFeishuSpace(
  userId: string,
  spaceId: string,
  spaceName: string,
  skipTokens: string[]
): Promise<SyncBatchResult> {
  const token = await getFeishuAccessToken(userId);
  const { nodes, truncated } = await listAllWikiNodes(token, spaceId);

  const result: SyncBatchResult = {
    done: false,
    total: 0,
    pending: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    unsupported: 0,
    failed: [],
    items: [],
    nextUp: [],
  };
  if (truncated) {
    result.failed.push({
      nodeToken: "",
      title: tk("（知识库过大）"),
      reason: tk("节点数超过上限，仅同步前 1000 个"),
    });
  }

  // The source doc of a shortcut is usually in the tree too; syncing it would create duplicates, so treat it as unsupported
  const docxNodes = nodes.filter((n) => n.objType === "docx" && n.nodeType === "origin");
  result.total = docxNodes.length;
  result.unsupported = nodes.length - docxNodes.length;

  const links = await prisma.feishuDocLink.findMany({
    where: { userId },
    include: { document: { select: { category: true } } },
  });
  const linkOf = new Map(links.map((l) => [l.nodeToken, l]));

  const skip = new Set(skipTokens);
  const changed: WikiNode[] = [];
  for (const node of docxNodes) {
    if (skip.has(node.nodeToken)) continue;
    const link = linkOf.get(node.nodeToken);
    if (link && link.objEditTime === node.objEditTime) {
      result.skipped++;
      continue;
    }
    changed.push(node);
  }

  const images = makeImageResolver(userId, token);
  const startedAt = Date.now();
  let processed = 0;

  for (const node of changed) {
    if (processed >= BATCH_DOCS) break;
    if (processed > 0 && Date.now() - startedAt > TIME_BUDGET_MS) break;
    processed++;
    const title = node.title.trim() || "未命名文档"; // i18n-ignore article title stored in the DB, it's data
    try {
      const blocks = await listDocBlocks(token, node.objToken);
      await images.prime(feishuImageTokens(blocks));
      const content = await feishuBlocksToMarkdown(blocks, { resolveImage: images.resolve });
      const category = buildCategory(spaceName, node.path);

      const link = linkOf.get(node.nodeToken);
      if (link) {
        // Categories follow the Feishu hierarchy only while the article stays in the 「飞书知识库」 mirror subtree;
        // for pushed-origin articles and ones the user moved into their own category (claimed), pulls only update content, not category
        const followCategory = link.origin !== "push" && inMirrorTree(link.document.category);
        // Returns the server updatedAt (null = not written); here we only care whether it was written
        const updated = await updateDocument(userId, link.documentId, {
          title,
          content,
          ...(followCategory ? { category } : {}),
        });
        if (updated) {
          result.updated++;
          result.items.push({ title, action: "updated" });
        } else result.skipped++; // article is in the trash (or gone and cleaned up via foreign key): respect the user's deletion, don't write
      } else {
        const doc = await createDocument(userId, { title, content, category });
        await prisma.feishuDocLink.create({
          data: { userId, nodeToken: node.nodeToken, documentId: doc.id },
        });
        result.created++;
        result.items.push({ title, action: "created" });
      }
      await prisma.feishuDocLink.updateMany({
        where: { userId, nodeToken: node.nodeToken },
        data: { objEditTime: node.objEditTime },
      });
    } catch (e) {
      result.failed.push({
        nodeToken: node.nodeToken,
        title,
        reason: e instanceof Error ? e.message : tk("未知错误"),
      });
    }
  }

  result.pending = changed.length - processed;
  result.nextUp = changed
    .slice(processed, processed + BATCH_DOCS)
    .map((n) => n.title.trim() || "未命名文档"); // i18n-ignore article title stored in the DB, it's data
  result.done = result.pending === 0;
  if (result.done) {
    await prisma.feishuConnection.updateMany({
      where: { userId },
      data: { spaceId, spaceName, lastSyncAt: new Date() },
    });
  }
  return result;
}
