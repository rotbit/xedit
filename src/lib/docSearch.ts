/**
 * 文章全文检索（纯函数，无 React）。
 * 正文全部躺在 localStorage —— 本地库 `xedit-local-doc:*`、云端镜像 `xedit-mirror-doc:*`，
 * 所以检索完全在客户端做：离线照样能搜，也不必为搜索开一条接口。
 * 逐篇读 localStorage 的开销由调用方兜住（快速切换器防抖 120ms，侧栏用 useMemo 缓存一轮结果）。
 */

import { indexOf } from "@/lib/docIndex";
import type { DocMeta } from "@/features/workspace/types";

export interface DocHit {
  doc: DocMeta;
  /** 命中位置：标题命中排在正文命中之前，高亮目标也由它决定 */
  where: "title" | "content";
  /** 展示用的一行上下文：正文命中取命中处前后文，标题命中退回列表摘要 */
  snippet: string;
  /** snippet 内的命中区间（按起点升序、重叠已合并），供高亮 */
  ranges: [number, number][];
}

/** 正文命中时的取景窗：命中位置前 30 字、后 90 字 */
const SNIPPET_BEFORE = 30;
const SNIPPET_AFTER = 90;

/** 查询词：按空白拆开并小写，词与词之间是 AND */
export function splitQuery(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * text 里所有词的命中区间。重叠的合并成一段——
 * 否则「编辑 编辑器」这种前缀重叠的词会把同一处切成两个 <mark>，中间露出一道缝。
 */
export function matchRanges(text: string, terms: string[]): [number, number][] {
  const hay = text.toLowerCase();
  const raw: [number, number][] = [];
  for (const term of terms) {
    for (let i = hay.indexOf(term); i !== -1; i = hay.indexOf(term, i + term.length)) {
      raw.push([i, i + term.length]);
    }
  }
  raw.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of raw) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** 摘要窗口的锚点：优先第一个词，它只在标题里时退而用最早出现的那个词 */
function anchorAt(hay: string, terms: string[]): number {
  const first = hay.indexOf(terms[0]);
  if (first !== -1) return first;
  let at = -1;
  for (const term of terms.slice(1)) {
    const i = hay.indexOf(term);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  return at === -1 ? 0 : at;
}

/** 截命中处上下文；两头有截断就补省略号（高亮区间在成串之后再算，省得跟着偏移） */
function buildSnippet(text: string, terms: string[]): string {
  if (!text) return "";
  const at = anchorAt(text.toLowerCase(), terms);
  const start = Math.max(0, at - SNIPPET_BEFORE);
  const end = Math.min(text.length, at + SNIPPET_AFTER);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/** 空查询时的结果：按更新时间倒序，摘要用列表摘要 */
function listOnly(docs: DocMeta[], limit: number): DocHit[] {
  return docs.slice(0, limit).map((doc) => ({
    doc,
    where: "title" as const,
    snippet: doc.excerpt ?? "",
    ranges: [],
  }));
}

/**
 * 搜文章：标题命中排前，正文命中排后，同级内按更新时间倒序。
 * 空查询返回最近更新的 limit 篇（快速切换器的「最近编辑」）。
 */
export function searchDocs(
  docs: DocMeta[],
  query: string,
  opts: { limit?: number } = {}
): DocHit[] {
  const limit = opts.limit ?? 30;
  if (limit <= 0) return [];
  const recent = [...docs].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const terms = splitQuery(query);
  if (terms.length === 0) return listOnly(recent, limit);

  // 先扫一遍标题（只碰元信息，便宜），标题没中的再读正文：
  // 凑满 limit 就收手，免得每次查询都把几百篇正文从 localStorage 全捞一遍
  const titleHits: DocHit[] = [];
  const rest: DocMeta[] = [];
  for (const doc of recent) {
    const title = doc.title.toLowerCase();
    if (terms.every((t) => title.includes(t))) {
      const snippet = doc.excerpt ?? "";
      titleHits.push({ doc, where: "title", snippet, ranges: matchRanges(snippet, terms) });
    } else {
      rest.push(doc);
    }
  }

  const hits = titleHits.slice(0, limit);
  for (const doc of rest) {
    if (hits.length >= limit) break;
    // 正文走 docIndex 的缓存（`[[目标|别名]]` 已摊平成显示文字，搜别名也能命中）；
    // 镜像没拉下来时退回摘要，至少不漏掉能匹配的那点文字
    const body = indexOf(doc).text || (doc.excerpt ?? "");
    // 词可以分散在标题和正文里：搜「张三 采访」应该命中标题带张三、正文提采访的那篇
    const hay = `${doc.title}\n${body}`.toLowerCase();
    if (!terms.every((t) => hay.includes(t))) continue;
    const snippet = buildSnippet(body, terms);
    hits.push({ doc, where: "content", snippet, ranges: matchRanges(snippet, terms) });
  }
  return hits;
}
