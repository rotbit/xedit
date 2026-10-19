/**
 * When a title changes, rewrite `[[wikilinks]]` elsewhere that point to it (like Obsidian's rename-updates-references).
 *
 * Pure functions, no React. Links resolve by title (see lib/wikiLink), so once a title changes, other people's
 * `[[old title]]` become broken links, unless they're all updated at the same moment, which is what this does.
 *
 * Persistence goes through the same local-first path as autosave (local library / cloud mirror + push),
 * except it never touches editorPersistence's rememberSavedDocument: that's the session baseline for "the currently open document",
 * and dirtying it with another article's content would make the editor think it's saved and drop unsaved edits.
 */

import { getDocContent } from "@/lib/docContent";
import { indexOf } from "@/lib/docIndex";
import { saveMirrorLocal } from "@/lib/docStore";
import { isLocalId, updateLocalDoc } from "@/lib/localDocs";
import { pushMirrorDoc } from "@/lib/sync";
import { normalizeTitle, parseWikiLinks } from "@/lib/wikiLink";
import type { DocMeta } from "@/features/workspace/types";

/**
 * Titles that can safely go inside `[[…]]`: brackets, pipes and newlines change the link's own structure
 * (`|` conjures an alias, `]]` closes the link early); for such titles we'd rather not update references
 * than corrupt someone's body text. The rule matches parseWikiLinks' regex.
 */
export function isLinkableTitle(title: string): boolean {
  return /^[^[\]|\r\n]+$/.test(title.trim());
}

/**
 * Library articles whose body contains `[[oldTitle]]` (excluding excludeId itself).
 * Uses docIndex's cache, sharing a single parse with search.
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
  /** Number of links actually rewritten; 0 means the body is returned unchanged */
  count: number;
}

/**
 * Replace every `[[old title]]` / `[[old title|alias]]` in the body with the new title, keeping aliases as-is.
 *
 * Only the ranges from parseWikiLinks are touched, so fenced blocks and inline code are naturally unaffected;
 * matching uses normalizeTitle (case- and surrounding-whitespace-insensitive), the same rule as link navigation.
 * Replace back to front: editing later ones first keeps the offsets of earlier, not-yet-used ones from shifting.
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

/** Persistence result; only local-error / write-error mean it really wasn't written */
export type PersistDocResult =
  | "local"
  | "local-error"
  | "write-error"
  | "offline"
  | "push-failed"
  | "synced";

/** Is the content saved on this machine? (offline / push failures still count; the dirty flag makes the sync engine keep pushing) */
export function isPersisted(result: PersistDocResult): boolean {
  return result !== "local-error" && result !== "write-error";
}

/**
 * Write rewritten body text back to an article that is "not the currently open one".
 * Local documents go to the local library; cloud documents land in the mirror first then try to push; offline or push failure doesn't throw,
 * since the mirror's dirty flag makes the sync engine push again next round.
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
      return "local-error"; // localStorage is full
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
  /** Number of articles rewritten and persisted */
  updated: number;
  /** Number of articles rewritten but not written */
  failed: number;
}

/**
 * Rewrite and persist one by one. Serial rather than concurrent: each reads and writes localStorage,
 * so concurrency would only block the main thread harder, and cloud pushes are backstopped by the sync engine anyway.
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
    // No hit, so don't write: the body may never have been fetched locally (cloud mirror not synced yet), and writing back would wipe it
    if (count === 0) continue;
    if (isPersisted(await persistDocContent(doc, content))) updated++;
    else failed++;
  }
  return { updated, failed };
}
