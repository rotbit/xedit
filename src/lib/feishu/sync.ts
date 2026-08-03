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
import { feishuBlocksToMarkdown } from "./markdown";

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

/** 目录层级 → 分类路径：`飞书知识库/空间名/祖先…`，段内斜杠替换掉，超长丢弃深层级 */
function buildCategory(spaceName: string, path: string[]): string {
  const segs = [spaceName, ...path]
    .map((s) => s.replaceAll("/", "／").trim().slice(0, 24))
    .filter(Boolean);
  let out = "飞书知识库";
  for (const seg of segs) {
    if (out.length + 1 + seg.length > 100) break;
    out += `/${seg}`;
  }
  return out;
}

/** 图片转存：同一飞书素材只存一次（按 source 复用），OSS 未配置时直接放弃 */
function makeImageResolver(userId: string, token: string) {
  const cache = new Map<string, string | null>();
  return async (fileToken: string): Promise<string | null> => {
    if (cache.has(fileToken)) return cache.get(fileToken)!;
    let url: string | null = null;
    if (ossConfigured()) {
      const source = `feishu:${fileToken}`;
      try {
        const existing = await prisma.asset.findFirst({
          where: { userId, source },
          select: { url: true },
        });
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
  };
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

  const links = await prisma.feishuDocLink.findMany({ where: { userId } });
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

  const resolveImage = makeImageResolver(userId, token);
  const startedAt = Date.now();
  let processed = 0;

  for (const node of changed) {
    if (processed >= BATCH_DOCS) break;
    if (processed > 0 && Date.now() - startedAt > TIME_BUDGET_MS) break;
    processed++;
    const title = node.title.trim() || "未命名文档";
    try {
      const blocks = await listDocBlocks(token, node.objToken);
      const content = await feishuBlocksToMarkdown(blocks, { resolveImage });
      const category = buildCategory(spaceName, node.path);

      const link = linkOf.get(node.nodeToken);
      if (link) {
        // 从 xedit 推送出去的文章：拉取更新内容但不动分类（它的家在 xedit 这边）
        const ok = await updateDocument(userId, link.documentId, {
          title,
          content,
          ...(link.origin === "push" ? {} : { category }),
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
