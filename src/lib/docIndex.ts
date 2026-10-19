/**
 * Unified cache layer for library-derived data (pure functions, no React).
 *
 * Full-text search and `[[wikilinks]]` both need data computed from the same body text;
 * computing them separately means reading and parsing each body from localStorage twice; merged, it's parsed once.
 *
 * The cache is required, not an optimization: autosave swaps the docs reference every few hundred ms,
 * and search and rename-relinking rerun a full-library scan each time; the cost should only land on the doc that actually changed.
 *
 * Invalidation only looks at updatedAt + chars in the metadata, never the body: every write path
 * (saveMirrorLocal / updateLocalDoc / vault rescan) refreshes both,
 * so the body can't change without the metadata changing. Pulling the full body out of localStorage just to compare lengths
 * would defeat the cache: with hundreds of docs, every keystroke would be hundreds of getItem calls.
 */

import { getDocContent } from "@/lib/docContent";
import { plainText } from "@/lib/excerpt";
import { parseWikiLinks, wikiLinkText, type WikiLinkRef } from "@/lib/wikiLink";
import type { DocMeta } from "@/features/workspace/types";

export interface DocIndexEntry {
  /** `[[wikilinks]]` in the body, with source offsets */
  links: WikiLinkRef[];
  /** Plain text with Markdown markup stripped; search and rename-relinking share this one convention */
  text: string;
}

// The plain-text implementation moved to excerpt.ts (shared by list excerpts and the server list API);
// the export stays here unchanged because docSearch still re-exports this symbol
export { plainText };

/**
 * Convert to plain text, flattening `[[target|alias]]` into its displayed text; excerpts shouldn't show brackets.
 * Search uses this: searching "alias" matches docs containing `[[target|alias]]`, consistent with what readers see.
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
  /** Character count from metadata; undefined for old entries/meta without it, in which case only updatedAt is checked */
  chars: number | undefined;
  /** The body was empty when this entry was built: the cloud mirror may land locally a bit later, so empty results shouldn't stick */
  empty: boolean;
  entry: DocIndexEntry;
}

const cache = new Map<string, CacheRow>();

/**
 * Derived data for one document. If the metadata hasn't changed, return the cache without even reading the body;
 * only when the cache is missing, updatedAt/chars changed, or the body hadn't arrived at last indexing, re-read the body and rebuild.
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
 * Drop entries no longer in the library (deleted, or library switched by logging out).
 * The cache is keyed by id and long-lived; without pruning it would hold bodies that will never be used again in memory.
 */
export function pruneIndex(liveIds: Iterable<string>): void {
  const live = new Set(liveIds);
  for (const id of cache.keys()) {
    if (!live.has(id)) cache.delete(id);
  }
}
