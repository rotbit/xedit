/**
 * Full-text document search (pure functions, no React).
 * All bodies live in localStorage (local library `xedit-local-doc:*`, cloud mirror `xedit-mirror-doc:*`),
 * so search runs entirely on the client: it works offline and needs no search API.
 * The cost of reading localStorage per doc is absorbed by callers (quick switcher debounces 120ms, sidebar caches a round via useMemo).
 *
 * Two exports: searchDocs for display lists (with snippets and highlight ranges), searchDocIds when you only need which docs match.
 * Both share the same matching logic, so semantics always agree; the only difference is whether snippets are built after a match.
 */

import { indexOf } from "@/lib/docIndex";
import type { DocMeta } from "@/features/workspace/types";

export interface DocHit {
  doc: DocMeta;
  /** Where it matched: title matches rank before body matches and also decide the highlight target */
  where: "title" | "content";
  /** One line of context for display: body matches show surrounding text, title matches fall back to the list excerpt */
  snippet: string;
  /** Match ranges within snippet (sorted by start, overlaps merged), for highlighting */
  ranges: [number, number][];
}

/** Snippet window for body matches: 30 chars before the match, 90 after */
const SNIPPET_BEFORE = 30;
const SNIPPET_AFTER = 90;

/** Query terms: split on whitespace and lowercased; terms are ANDed */
export function splitQuery(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * All match ranges of the terms in text. Overlapping ranges are merged;
 * otherwise prefix-overlapping terms like "edit editor" would split one spot into two <mark>s with a visible seam.
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

/** Whether all terms match the title: touches only metadata, not the body, so a full-library scan is cheap */
function titleHit(doc: DocMeta, terms: string[]): boolean {
  const title = doc.title.toLowerCase();
  return terms.every((t) => title.includes(t));
}

/**
 * Whether the body matches; returns that body on a match (for the snippet), otherwise null.
 * Terms may be split across title and body: searching "alice interview" should match a doc with Alice in the title and "interview" in the body.
 * Bodies go through docIndex's cache (`[[target|alias]]` already flattened to display text, so aliases match too);
 * if the mirror hasn't been fetched, fall back to the excerpt so at least that text can still match.
 */
function bodyHit(doc: DocMeta, terms: string[]): string | null {
  const body = indexOf(doc).text || (doc.excerpt ?? "");
  const hay = `${doc.title}\n${body}`.toLowerCase();
  return terms.every((t) => hay.includes(t)) ? body : null;
}

/** Anchor for the snippet window: prefer the first term; if it's only in the title, use the earliest-occurring term */
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

/** Cut context around the match; add ellipses where either end is truncated (highlight ranges are computed after joining to avoid offset drift) */
function buildSnippet(text: string, terms: string[]): string {
  if (!text) return "";
  const at = anchorAt(text.toLowerCase(), terms);
  const start = Math.max(0, at - SNIPPET_BEFORE);
  const end = Math.min(text.length, at + SNIPPET_AFTER);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/** Results for an empty query: sorted by update time descending, using the list excerpt */
function listOnly(docs: DocMeta[], limit: number): DocHit[] {
  return docs.slice(0, limit).map((doc) => ({
    doc,
    where: "title" as const,
    snippet: doc.excerpt ?? "",
    ranges: [],
  }));
}

/**
 * Search documents: title matches first, then body matches, each tier sorted by update time descending.
 * An empty query returns the `limit` most recently updated docs (the quick switcher's "recently edited").
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

  // Scan titles first (metadata only, cheap), then read bodies only for docs whose titles didn't match;
  // stop once limit is reached, so each query doesn't pull hundreds of bodies out of localStorage
  const titleHits: DocHit[] = [];
  const rest: DocMeta[] = [];
  for (const doc of recent) {
    if (titleHit(doc, terms)) {
      const snippet = doc.excerpt ?? "";
      titleHits.push({ doc, where: "title", snippet, ranges: matchRanges(snippet, terms) });
    } else {
      rest.push(doc);
    }
  }

  const hits = titleHits.slice(0, limit);
  for (const doc of rest) {
    if (hits.length >= limit) break;
    const body = bodyHit(doc, terms);
    if (body === null) continue;
    const snippet = buildSnippet(body, terms);
    hits.push({ doc, where: "content", snippet, ranges: matchRanges(snippet, terms) });
  }
  return hits;
}

/**
 * Only the set of matching ids: used by the sidebar to filter its list.
 * Same matching as searchDocs, but no sorting, no length cap, no snippets or highlight ranges;
 * the sidebar throws those away immediately, which would be a wasted pass over hundreds of docs.
 * An empty query (only spaces) matches everything, consistent with searchDocs' "list all".
 */
export function searchDocIds(docs: DocMeta[], query: string): Set<string> {
  const ids = new Set<string>();
  const terms = splitQuery(query);
  for (const doc of docs) {
    if (terms.length === 0 || titleHit(doc, terms) || bodyHit(doc, terms) !== null) {
      ids.add(doc.id);
    }
  }
  return ids;
}
