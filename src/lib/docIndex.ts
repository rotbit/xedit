/**
 * 文库派生数据的统一缓存层（纯函数，无 React）。
 *
 * 全文检索与 `[[双向链接]]` 要的两样东西都是从同一份正文算出来的，
 * 各算各的就得把每篇正文从 localStorage 读两遍、解析两遍；合到一处只解析一遍。
 *
 * 缓存是必须的而不是优化：自动保存每隔几百毫秒就换一次 docs 引用，
 * 检索与改名重链都会跟着重跑一轮全库扫描，代价应该只落在真正动过的那一篇上。
 *
 * 失效键是 updatedAt + 正文长度两条一起看：云端镜像可能在 updatedAt 不变的情况下晚一步才拉到本地
 * （在此之前 getDocContent 返回空串），只认 updatedAt 会把「正文还没到」这个中间态一直缓存下去。
 */

import { getDocContent } from "@/lib/docContent";
import { parseWikiLinks, wikiLinkText, type WikiLinkRef } from "@/lib/wikiLink";
import type { DocMeta } from "@/features/workspace/types";

export interface DocIndexEntry {
  /** 正文里的 `[[双向链接]]`，带原文偏移 */
  links: WikiLinkRef[];
  /** 抹掉 Markdown 记号的纯文本，检索与改名重链共用这一份口径 */
  text: string;
}

/** 抹掉 Markdown 记号，让「**重点**」能被「重点」搜到（正则口径同 localDocs.summarize） */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`~$|-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 纯文本化，并把 `[[目标|别名]]` 摊平成它显示出来的文字 —— 摘要里不该露方括号。
 * 检索走这一份：搜「别名」能命中写着 `[[目标|别名]]` 的文章，和读者看到的一致。
 */
export function flatten(md: string): string {
  return plainText(
    md.replace(/\[\[([^[\]\r\n]+)\]\]/g, (_m, body: string) => {
      const bar = body.indexOf("|");
      return bar === -1 ? body : wikiLinkText(body.slice(0, bar), body.slice(bar + 1));
    })
  );
}

const cache = new Map<string, { updatedAt: string; length: number; entry: DocIndexEntry }>();

/**
 * 一篇文章的派生数据。正文每次都读（getItem 便宜），贵的解析只在版本变了时做。
 */
export function indexOf(doc: DocMeta): DocIndexEntry {
  const content = getDocContent(doc.id);
  const hit = cache.get(doc.id);
  if (hit && hit.updatedAt === doc.updatedAt && hit.length === content.length) return hit.entry;

  const entry: DocIndexEntry = {
    links: parseWikiLinks(content),
    text: flatten(content),
  };
  cache.set(doc.id, { updatedAt: doc.updatedAt, length: content.length, entry });
  return entry;
}

/**
 * 丢掉已不在文库里的条目（删除、退出登录换库）。
 * 缓存按 id 长住，不清就会把再也用不到的正文一直攥在内存里。
 */
export function pruneIndex(liveIds: Iterable<string>): void {
  const live = new Set(liveIds);
  for (const id of cache.keys()) {
    if (!live.has(id)) cache.delete(id);
  }
}
