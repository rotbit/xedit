/**
 * 与磁盘对账：Obsidian 等外部编辑器在库里新增/改动/删掉的文件，扫一遍反映进内存缓存。
 * 自己写的不算外部改动 —— 每次写完都会把 file.lastModified 记回 entry.mtime，
 * 对账时 mtime 一致的连正文都不用读。
 */

import { summarize } from "./types";
import { makeEntry, uniqueDocId, type Entry, type VaultCtx } from "./vaultEntry";
import { readVaultFiles, walkVault } from "./vaultFs";

/** 变动文档的 id */
export interface RescanResult {
  added: string[];
  changed: string[];
  removed: string[];
}

/** 返回的 rescan 是可重入安全的：一轮还没跑完时再调，跟着同一个 Promise 走 */
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
  // 先把队列里的写落盘：否则自己还没写出去的文件会被当成「磁盘上没有」而被清掉
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
      if (text === null) return; // mtime 没变，不是外部改动
      const hit = byRel.get(path);
      if (!hit) {
        const entry = makeEntry(path, text, mtime, uniqueDocId(ctx.docs, path));
        ctx.docs.set(entry.meta.id, entry);
        added.push(entry.meta.id);
        return;
      }
      // 路径没变，标题与分类也就没变，只刷正文、摘要和时间
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
  // 分类以磁盘为准：队列已排空，缓存里不会再有「还没建出来」的目录
  ctx.cats.clear();
  for (const d of dirs) ctx.cats.add(d);
  onScanned();
  return { added, changed, removed };
}
