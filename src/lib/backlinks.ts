/**
 * 反向链接（纯函数，无 React）：谁链到了本文，谁提到了本文却没链。
 *
 * 与 `[[双向链接]]` 同一套口径 —— 按标题解析（见 lib/wikiLink），正文从 localStorage 现读
 * （见 docSearch.getDocContent），所以离线照样算得出来，也不必为反链另开一条接口。
 * 链接与纯文本都走 docIndex 的缓存，与标签、检索共用同一次解析。
 */

import { flatten, indexOf } from "@/lib/docIndex";
import { getDocContent, matchRanges } from "@/lib/docSearch";
import { normalizeTitle } from "@/lib/wikiLink";
import type { DocMeta } from "@/features/workspace/types";

export interface BacklinkHit {
  doc: DocMeta;
  /** 一行上下文：链接所在行，或提及处前后的取景窗 */
  snippet: string;
  /** snippet 内命中本文标题的区间（按起点升序、重叠已合并），供高亮 */
  ranges: [number, number][];
}

export interface Backlinks {
  /** 正文里写了 `[[本文标题]]` 的文章 */
  linked: BacklinkHit[];
  /** 提到了本文标题但没建链接的文章（Obsidian 的 unlinked mentions） */
  unlinked: BacklinkHit[];
}

/** 链接所在行太长时的取景窗：命中处前后各 40 字 */
const LINK_CONTEXT = 40;
/** 未链接提及的取景窗：命中处前后各 80 字 */
const MENTION_CONTEXT = 80;
/** 链接所在行短于这个长度就整行照搬，长了才截窗 */
const LINE_MAX = 120;
/** 一个字的标题（「我」「书」）满篇都是，当提及会全是噪音，只认真正的链接 */
const MIN_MENTION_LEN = 2;

const EMPTY: Backlinks = { linked: [], unlinked: [] };

/** 截取 key 命中处周围的一段；两头有截断就补省略号 */
function clipAround(text: string, key: string, span: number): string {
  const at = text.toLowerCase().indexOf(key);
  if (at === -1) return text.slice(0, span * 2);
  const start = Math.max(0, at - span);
  const end = Math.min(text.length, at + key.length + span);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/** 链接所在的那一行（整行通常就是最好的上下文，长了才退回取景窗） */
function lineSnippet(content: string, at: number, key: string): string {
  const start = content.lastIndexOf("\n", at) + 1;
  const end = content.indexOf("\n", at);
  const line = flatten(content.slice(start, end === -1 ? content.length : end));
  return line.length <= LINE_MAX ? line : clipAround(line, key, LINK_CONTEXT);
}

/**
 * 算出链到本文的与提到本文的两组文章，各按更新时间倒序。
 * 跳过自身，标题为空时直接返回空（没有标题就无从链起）。
 */
export function computeBacklinks(
  docs: DocMeta[],
  current: { id: string; title: string }
): Backlinks {
  const title = current.title.trim();
  if (!title) return EMPTY;
  const key = normalizeTitle(title);
  const terms = [key];
  const linked: BacklinkHit[] = [];
  const unlinked: BacklinkHit[] = [];

  const recent = [...docs].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  for (const doc of recent) {
    if (doc.id === current.id) continue;
    const { links, text } = indexOf(doc);

    const link = links.find((l) => normalizeTitle(l.target) === key);
    if (link) {
      // 上下文要的是链接所在的那一行原文，摊平过的 text 已经没有行也没有偏移了；
      // 只有命中链接的这少数几篇才多读一次 localStorage
      const snippet = lineSnippet(getDocContent(doc.id), link.from, key);
      linked.push({ doc, snippet, ranges: matchRanges(snippet, terms) });
      continue;
    }
    if (key.length < MIN_MENTION_LEN) continue;
    if (!text.toLowerCase().includes(key)) continue;
    const snippet = clipAround(text, key, MENTION_CONTEXT);
    unlinked.push({ doc, snippet, ranges: matchRanges(snippet, terms) });
  }
  return { linked, unlinked };
}
