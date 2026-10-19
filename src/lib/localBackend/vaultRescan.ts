/**
 * Disk rescan: scan for files added/changed/deleted in the library by external editors like Obsidian, and reflect them in the in-memory cache.
 * Our own writes aren't external changes: every write stores file.lastModified back into entry.mtime,
 * so files with matching mtime don't even need their body read.
 */

import { summarize } from "./types";
import { makeEntry, uniqueDocId, type Entry, type VaultCtx } from "./vaultEntry";
import { readVaultFiles, walkVault } from "./vaultFs";

/** Ids of changed documents */
export interface RescanResult {
  added: string[];
  changed: string[];
  removed: string[];
}

/** The returned rescan is reentrancy-safe: calling again mid-run joins the same Promise */
export function createRescanner(
  ctx: VaultCtx,
  onScanned: () => void
): () => Promise<RescanResult> {
  let running: Promise<RescanResult> | null = null;
  return () => {
    running ??= run(ctx, onScanned).finally(() => {
      running = null;
    });
    return running;
  };
}

async function run(ctx: VaultCtx, onScanned: () => void): Promise<RescanResult> {
  // Flush queued writes first, or files we haven't written yet would look "missing on disk" and get purged
  await ctx.flush();
  const { files, dirs } = await walkVault(ctx.root);
  const byRel = new Map<string, Entry>();
  for (const e of ctx.docs.values()) byRel.set(e.relPath, e);

  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  const seen = new Set<string>();
  await readVaultFiles(
    files,
    (path, mtime, text) => {
      seen.add(path);
      if (text === null) return; // mtime unchanged, not an external change
      const hit = byRel.get(path);
      if (!hit) {
        const entry = makeEntry(path, text, mtime, uniqueDocId(ctx.docs, path));
        ctx.docs.set(entry.meta.id, entry);
        added.push(entry.meta.id);
        return;
      }
      // Path unchanged means title and category are too; refresh only body, excerpt and time
      hit.content = text;
      hit.mtime = mtime;
      hit.meta.updatedAt = new Date(mtime).toISOString();
      Object.assign(hit.meta, summarize(text));
      changed.push(hit.meta.id);
    },
    (path, mtime) => byRel.get(path)?.mtime !== mtime
  );

  for (const [id, e] of ctx.docs) {
    if (seen.has(e.relPath)) continue;
    ctx.docs.delete(id);
    removed.push(id);
  }
  // Categories follow the disk: the queue is drained, so the cache has no "not yet created" folders
  ctx.cats.clear();
  for (const d of dirs) ctx.cats.add(d);
  onScanned();
  return { added, changed, removed };
}
