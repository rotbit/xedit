/**
 * 文库派生数据的统一缓存层（纯函数，无 React）。
 *
 * 全文检索与 `[[双向链接]]` 要的两样东西都是从同一份正文算出来的，
 * 各算各的就得把每篇正文从 localStorage 读两遍、解析两遍；合到一处只解析一遍。
 *
 * 缓存是必须的而不是优化：自动保存每隔几百毫秒就换一次 docs 引用，
 * 检索与改名重链都会跟着重跑一轮全库扫描，代价应该只落在真正动过的那一篇上。
 *
 * 失效只看元信息里的 updatedAt + chars，不读正文：写盘的那几条路径
 * （saveMirrorLocal / updateLocalDoc / vault 回扫）每次都连带刷新这两项，
 * 正文变了元信息不可能不变。为了比长度而把整篇正文从 localStorage 捞出来，
 * 等于缓存白做——几百篇文章每敲一键就是几百次 getItem。
 */

import { getDocContent } from "@/lib/docContent";
import { plainText } from "@/lib/excerpt";
import { parseWikiLinks, wikiLinkText, type WikiLinkRef } from "@/lib/wikiLink";
import type { DocMeta } from "@/features/workspace/types";

export interface DocIndexEntry {
  /** 正文里的 `[[双向链接]]`，带原文偏移 */
  links: WikiLinkRef[];
  /** 抹掉 Markdown 记号的纯文本，检索与改名重链共用这一份口径 */
  text: string;
}

// 纯文本化的实现搬去了 excerpt.ts（列表摘要、服务端列表接口共用同一口径）；
// 出口保留在这里不变——docSearch 还在往外转发这个符号
export { plainText };

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

interface CacheRow {
  updatedAt: string;
  /** 元信息里的字数；老条目/老 meta 没有这一项时是 undefined，此时只认 updatedAt */
  chars: number | undefined;
  /** 建这条时正文是空的：云端镜像可能晚一步才落到本地，空结果不能长住 */
  empty: boolean;
  entry: DocIndexEntry;
}

const cache = new Map<string, CacheRow>();

/**
 * 一篇文章的派生数据。元信息没变就直接给缓存，连正文都不读；
 * 只有缓存缺失、updatedAt/chars 变了，或上次建索引时正文还没到，才回头读一次正文重建。
 */
export function indexOf(doc: DocMeta): DocIndexEntry {
  const hit = cache.get(doc.id);
  if (hit && hit.updatedAt === doc.updatedAt && hit.chars === doc.chars && !hit.empty) {
    return hit.entry;
  }

  const content = getDocContent(doc.id);
  const entry: DocIndexEntry = {
    links: parseWikiLinks(content),
    text: flatten(content),
  };
  cache.set(doc.id, {
    updatedAt: doc.updatedAt,
    chars: doc.chars,
    empty: content.length === 0,
    entry,
  });
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
