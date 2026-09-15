/**
 * 改标题时同步改写别处指向它的 `[[双向链接]]`（Obsidian 的 rename 更新引用）。
 *
 * 纯函数、无 React。链接按标题解析（见 lib/wikiLink），标题一改，别人写的
 * `[[旧标题]]` 就成了断链 —— 除非同一刻把它们一起改掉，这就是这里做的事。
 *
 * 落盘走的是和自动保存同一条本地优先路径（本地库 / 云端镜像 + 推送），
 * 唯独不碰 editorPersistence 的 rememberSavedDocument：那是「当前打开的那一篇」
 * 的会话基准，被别的文章的内容写脏，编辑器会误判自己已落盘而丢掉未保存的编辑。
 */

import { getDocContent } from "@/lib/docContent";
import { indexOf } from "@/lib/docIndex";
import { saveMirrorLocal } from "@/lib/docStore";
import { isLocalId, updateLocalDoc } from "@/lib/localDocs";
import { pushMirrorDoc } from "@/lib/sync";
import { normalizeTitle, parseWikiLinks } from "@/lib/wikiLink";
import type { DocMeta } from "@/features/workspace/types";

/**
 * 能安全写进 `[[…]]` 的标题：方括号、竖线、换行都会改变链接本身的结构
 * （`|` 会凭空变出一个别名，`]]` 会把链接提前收口），这种标题宁可不改引用，
 * 也好过把别人的正文写坏。判定口径与 parseWikiLinks 的正则一致。
 */
export function isLinkableTitle(title: string): boolean {
  return /^[^[\]|\r\n]+$/.test(title.trim());
}

/**
 * 文库里正文写了 `[[oldTitle]]` 的文章（排除 excludeId 自身）。
 * 走 docIndex 的缓存，与标签、检索、反链共用同一次解析。
 */
export function findLinkingDocs(
  docs: DocMeta[],
  oldTitle: string,
  excludeId: string
): DocMeta[] {
  const key = normalizeTitle(oldTitle);
  if (!key) return [];
  return docs.filter(
    (doc) =>
      doc.id !== excludeId &&
      indexOf(doc).links.some((link) => normalizeTitle(link.target) === key)
  );
}

export interface RewriteResult {
  content: string;
  /** 实际改写的链接数，0 表示正文原样返回 */
  count: number;
}

/**
 * 把正文里所有 `[[旧标题]]` / `[[旧标题|别名]]` 换成新标题，别名原样保留。
 *
 * 只动 parseWikiLinks 给出的区间，围栏块与行内代码因此天然不受影响；
 * 匹配用 normalizeTitle（大小写、首尾空格不敏感），与链接跳转、反链同一套口径。
 * 从后往前替换：先改后面的，前面那些还没用到的偏移就不会被挪动。
 */
export function rewriteLinks(
  content: string,
  oldTitle: string,
  newTitle: string
): RewriteResult {
  const key = normalizeTitle(oldTitle);
  const next = newTitle.trim();
  if (!key || !next || !isLinkableTitle(next)) return { content, count: 0 };

  const hits = parseWikiLinks(content).filter((l) => normalizeTitle(l.target) === key);
  let out = content;
  for (let i = hits.length - 1; i >= 0; i--) {
    const { alias, from, to } = hits[i];
    const body = alias ? `${next}|${alias}` : next;
    out = `${out.slice(0, from)}[[${body}]]${out.slice(to)}`;
  }
  return { content: out, count: hits.length };
}

/** 落盘结果；只有 local-error / write-error 是真的没写进去 */
export type PersistDocResult =
  | "local"
  | "local-error"
  | "write-error"
  | "offline"
  | "push-failed"
  | "synced";

/** 内容已经在本机存住了吗（离线 / 推送失败都还算存住，dirty 标记会让同步引擎接着推） */
export function isPersisted(result: PersistDocResult): boolean {
  return result !== "local-error" && result !== "write-error";
}

/**
 * 把改写后的正文写回某一篇「不是当前打开的」文章。
 * 本地文档进本地库，云端文档先落镜像再尝试推送；离线或推送失败都不抛，
 * 镜像的 dirty 标记会让同步引擎下一轮接着推。
 */
export async function persistDocContent(
  doc: DocMeta,
  content: string
): Promise<PersistDocResult> {
  if (isLocalId(doc.id)) {
    try {
      updateLocalDoc(doc.id, { content });
      return "local";
    } catch {
      return "local-error"; // localStorage 写满
    }
  }
  try {
    saveMirrorLocal(doc.id, { content });
  } catch {
    return "write-error";
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  return (await pushMirrorDoc(doc.id)) ? "synced" : "push-failed";
}

export interface RenameLinksReport {
  /** 成功改写并落盘的文章数 */
  updated: number;
  /** 改写了但没写进去的文章数 */
  failed: number;
}

/**
 * 逐篇改写并落盘。串行而不是并发：每篇都要读写 localStorage，
 * 并发只会把主线程卡得更死，而云端推送本来就有同步引擎兜底。
 */
export async function applyRenameLinks(
  targets: DocMeta[],
  oldTitle: string,
  newTitle: string
): Promise<RenameLinksReport> {
  let updated = 0;
  let failed = 0;
  for (const doc of targets) {
    const { content, count } = rewriteLinks(getDocContent(doc.id), oldTitle, newTitle);
    // 没命中就别写：正文可能压根没拉到本地（云端镜像尚未同步），写回去等于清空
    if (count === 0) continue;
    if (isPersisted(await persistDocContent(doc, content))) updated++;
    else failed++;
  }
  return { updated, failed };
}
