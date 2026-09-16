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

/**
 * 知识库 → xedit 的分批增量同步。
 * 每次调用只处理一小批文档就返回进度（HTTP 请求不能太长），客户端循环调到 done；
 * 幂等依据是 FeishuDocLink 里记录的 obj_edit_time——飞书侧没改过的文档整篇跳过。
 */

/** 单批最多处理的文档数与时间预算：先到者停，至少完成 1 篇保证收敛 */
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
  /** 本批实际写入的文档，前端进度列表用 */
  items: { title: string; action: "created" | "updated" }[];
  /** 接下来将处理的文档标题：下一批在跑时前端显示「正在同步 X」 */
  nextUp: string[];
}

/** 导入分类树的根：文章还在这棵子树下就跟随飞书目录，挪出去即视为用户认领 */
const ROOT_CAT = "飞书知识库";

/** 目录层级 → 分类路径：`飞书知识库/空间名/祖先…`，段内斜杠替换掉，超长丢弃深层级 */
function buildCategory(spaceName: string, path: string[]): string {
  const segs = [spaceName, ...path]
    .map((s) => s.replaceAll("/", "／").trim().slice(0, 24))
    .filter(Boolean);
  let out = ROOT_CAT;
  for (const seg of segs) {
    if (out.length + 1 + seg.length > 100) break;
    out += `/${seg}`;
  }
  return out;
}

/** 文章当前是否还在「飞书知识库」镜像子树下 */
const inMirrorTree = (cat: string): boolean => cat === ROOT_CAT || cat.startsWith(`${ROOT_CAT}/`);

/** 图片转存：同一飞书素材只存一次（按 source 复用），OSS 未配置时直接放弃 */
function makeImageResolver(userId: string, token: string) {
  /** fileToken → 可用 URL；null = 本次同步已确认拿不到，不再重试 */
  const cache = new Map<string, string | null>();
  /** 已经查过库的 fileToken（命中与否都记），resolve 据此跳过逐图查询 */
  const looked = new Set<string>();

  /**
   * 转换前预热：本篇用到的素材一次 findMany 查完。
   * 原先每张图一次 findFirst，一篇几十张图就是几十个往返（N+1）。
   * 预热失败不算错——resolve 会退回逐图查库的老路，只是慢一点。
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
        // 没查到的不写 cache（那会被当成「确认拿不到」），留给 resolve 去下载
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
        // prime 查过的直接进下载分支（查到了的早已在 cache 里），没预热到的才兜底查一次
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
        url = null; // 单图失败不拖垮整篇：正文落占位文案
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
      title: "（知识库过大）",
      reason: "节点数超过上限，仅同步前 1000 个",
    });
  }

  // 快捷方式指向的原文档多半也在树里，同步会重复建档，按不支持处理
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
    const title = node.title.trim() || "未命名文档";
    try {
      const blocks = await listDocBlocks(token, node.objToken);
      await images.prime(feishuImageTokens(blocks));
      const content = await feishuBlocksToMarkdown(blocks, { resolveImage: images.resolve });
      const category = buildCategory(spaceName, node.path);

      const link = linkOf.get(node.nodeToken);
      if (link) {
        // 分类只在文章仍留在「飞书知识库」镜像子树里时跟随飞书目录；
        // 推送来源的、以及被用户挪到自己分类下的（视为认领），拉取都只更新内容不动分类
        const followCategory = link.origin !== "push" && inMirrorTree(link.document.category);
        const ok = await updateDocument(userId, link.documentId, {
          title,
          content,
          ...(followCategory ? { category } : {}),
        });
        if (ok) {
          result.updated++;
          result.items.push({ title, action: "updated" });
        } else result.skipped++; // 文章在回收站（或已没了又被外键清走）：尊重用户删除，不再写
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
        reason: e instanceof Error ? e.message : "未知错误",
      });
    }
  }

  result.pending = changed.length - processed;
  result.nextUp = changed
    .slice(processed, processed + BATCH_DOCS)
    .map((n) => n.title.trim() || "未命名文档");
  result.done = result.pending === 0;
  if (result.done) {
    await prisma.feishuConnection.updateMany({
      where: { userId },
      data: { spaceId, spaceName, lastSyncAt: new Date() },
    });
  }
  return result;
}
