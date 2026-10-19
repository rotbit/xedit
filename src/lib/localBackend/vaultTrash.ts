/**
 * Vault trash: deleting an article doesn't really delete it; it moves into <vault>/.trash/ keeping the original folder structure,
 * so the user can restore or permanently delete it. The trash has its own in-memory cache (built by scanning .trash on open);
 * an entry's relPath is relative to .trash, and the original category is derived from that path.
 */

import type { LocalDocMeta } from "./types";
import {
  addCat,
  dirCat,
  ID_PREFIX,
  join,
  makeEntry,
  stripMd,
  uniqueDocId,
  uniqueName,
  type Entry,
  type VaultCtx,
} from "./vaultEntry";
import {
  baseName,
  getDirectory,
  moveFile,
  parentPath,
  readVaultFiles,
  removeEntry,
  walkDirectory,
} from "./vaultFs";

/** Trash folder: dot-prefixed so the library scan skips it as metadata, and Obsidian won't treat it as library content */
export const TRASH_DIR = ".trash";

/** A trash entry's id and its disk location are both derived from its "path relative to .trash" */
const trashId = (rel: string): string => `${ID_PREFIX}${TRASH_DIR}/${rel}`;
const trashPath = (rel: string): string => `${TRASH_DIR}/${rel}`;

/** Scan .trash once on open; no such folder means an empty trash */
export async function loadTrash(root: FileSystemDirectoryHandle): Promise<Map<string, Entry>> {
  const trash = new Map<string, Entry>();
  const dir = await getDirectory(root, TRASH_DIR, false);
  if (!dir) return trash;
  // We scan from the .trash handle directly, so turn off top-level filters (it holds ordinary category folders and articles)
  const { files } = await walkDirectory(dir, { includeDotRoot: true });
  await readVaultFiles(files, (path, mtime, text) => {
    const entry = makeEntry(path, text ?? "", mtime, trashId(path));
    trash.set(entry.meta.id, entry);
  });
  return trash;
}

export interface TrashOps {
  /** Move a main-library document into trash; the caller removes it from docs first */
  moveToTrash(e: Entry): void;
  listTrash(): LocalDocMeta[];
  restoreFromTrash(id: string): LocalDocMeta | null;
  purgeFromTrash(id: string): void;
  emptyTrash(): void;
}

export function createTrash(ctx: VaultCtx): TrashOps {
  return {
    moveToTrash(e: Entry) {
      const dirPath = parentPath(e.relPath);
      // Keep the original path inside .trash; on a name clash at the same spot append " 1", " 2"...
      const name = uniqueName(ctx.trash.values(), dirPath, stripMd(baseName(e.relPath)), null);
      const rel = join(dirPath, name);
      const id = trashId(rel);
      // Reuse the main library's meta as-is (excerpt, word count, times are still accurate); only swap id and the de-duplicated title
      const entry: Entry = {
        relPath: rel,
        content: e.content,
        mtime: e.mtime,
        meta: { ...e.meta, id, title: stripMd(name), category: dirCat(dirPath) },
      };
      ctx.trash.set(id, entry);
      const from = e.relPath;
      ctx.enqueue(async () => {
        // moveFile creates .trash and the category folders under it itself
        entry.mtime = await moveFile(ctx.root, from, trashPath(rel));
      });
    },

    /** Same as listDocs: must return copies, or the UI's field comparison sees old and new pointing at the same objects */
    listTrash(): LocalDocMeta[] {
      return [...ctx.trash.values()].map((e) => ({ ...e.meta }));
    },

    restoreFromTrash(id: string): LocalDocMeta | null {
      const t = ctx.trash.get(id);
      if (!t) return null;
      ctx.trash.delete(id);
      // If the original path is taken add a suffix; if the original category folder is gone recreate it
      const dirPath = parentPath(t.relPath);
      const name = uniqueName(ctx.docs.values(), dirPath, stripMd(baseName(t.relPath)), null);
      const rel = join(dirPath, name);
      const newId = uniqueDocId(ctx.docs, rel);
      const entry: Entry = {
        relPath: rel,
        content: t.content,
        mtime: t.mtime,
        meta: { ...t.meta, id: newId, title: stripMd(name), category: dirCat(dirPath) },
      };
      ctx.docs.set(newId, entry);
      if (dirPath) addCat(ctx.cats, dirPath);
      ctx.enqueue(async () => {
        entry.mtime = await moveFile(ctx.root, trashPath(t.relPath), rel);
      });
      return { ...entry.meta };
    },

    purgeFromTrash(id: string) {
      const t = ctx.trash.get(id);
      if (!t) return;
      ctx.trash.delete(id);
      const path = trashPath(t.relPath);
      ctx.enqueue(async () => {
        const dir = await getDirectory(ctx.root, parentPath(path), false);
        if (dir) await removeEntry(dir, baseName(path));
      });
    },

    emptyTrash() {
      ctx.trash.clear();
      // Remove the whole .trash; moveFile recreates it the next time an article is deleted
      ctx.enqueue(async () => {
        if (!(await getDirectory(ctx.root, TRASH_DIR, false))) return;
        await removeEntry(ctx.root, TRASH_DIR, true);
      });
    },
  };
}
