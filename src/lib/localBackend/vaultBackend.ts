/**
 * Vault backend: the library lives directly in a user-chosen folder on disk (Obsidian-style).
 * The whole library is read into memory on open, so LocalBackend's sync reads still work; all writes go into a serial queue
 * so the UI never waits on disk. Ids are "local-v:<relative path>", which satisfies isLocalId and carries the location;
 * renames/moves only change entry.relPath and ids stay stable within a session, so the editor's id never goes stale.
 * Trash, attachments and disk rescan live in vaultTrash / vaultAttachments / vaultRescan; this file just wires them up.
 */

import { toast } from "@/components/Toast";
import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";
import {
  summarize,
  type DocInit,
  type DocPatch,
  type LocalBackend,
  type LocalDocMeta,
} from "./types";
import { createAttachments } from "./vaultAttachments";
import {
  addCat,
  catDir,
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
  fileMtime,
  getDirectory,
  moveDirectory,
  moveFile,
  parentPath,
  readTextFile,
  readVaultFiles,
  removeEntry,
  sanitizeFileName,
  walkVault,
  writeTextFile,
} from "./vaultFs";
import { createRescanner, type RescanResult } from "./vaultRescan";
import { createTrash, loadTrash } from "./vaultTrash";
import { t } from "@/i18n/t";

export type { RescanResult };

export interface VaultBackend extends LocalBackend {
  readonly kind: "vault";
  /** Root folder name, shown in the UI as the current library */
  readonly name: string;
  /** Sidebar order read on open (.xedit/order.json), or null if none */
  loadOrder(): unknown;
  saveOrder(o: unknown): void;
  /** Wait for the write queue to drain; call before closing the library */
  flush(): Promise<void>;
  /** Rescan disk: reflect files added/changed/deleted externally (Obsidian etc.) into the cache. Returns changed document ids */
  rescan(): Promise<RescanResult>;
  /** Trash listing; returns copies like listDocs */
  listTrash(): LocalDocMeta[];
  /** Restore to the original path (suffix on name clash, recreate missing folders); returns new meta, or null if id isn't in trash */
  restoreFromTrash(id: string): LocalDocMeta | null;
  /** Permanently delete one item from trash */
  purgeFromTrash(id: string): void;
  /** Empty the trash */
  emptyTrash(): void;
  /** Write an image or other binary into attachments/; returns the path relative to the vault root (e.g. "attachments/xxx.png") */
  saveAttachment(file: Blob, suggestedName: string): Promise<string>;
  /** Read an attachment as an object URL (cached, created once per path); null if missing */
  getAttachmentUrl(relPath: string): Promise<string | null>;
}

const ORDER_DIR = ".xedit";
const ORDER_FILE = "order.json";
/** Throttle write-failure toasts so a burst of failures doesn't flood the screen */
const TOAST_GAP = 3000;

async function readOrder(root: FileSystemDirectoryHandle): Promise<unknown> {
  try {
    const dir = await getDirectory(root, ORDER_DIR, false);
    if (!dir) return null;
    return JSON.parse(await readTextFile(await dir.getFileHandle(ORDER_FILE)));
  } catch {
    return null; // Never written or corrupted; treat as unsorted
  }
}

export async function openVaultBackend(root: FileSystemDirectoryHandle): Promise<VaultBackend> {
  const { files, dirs } = await walkVault(root);
  const docs = new Map<string, Entry>();
  const cats = new Set<string>(dirs);
  await readVaultFiles(files, (path, mtime, text) => {
    const entry = makeEntry(path, text ?? "", mtime);
    docs.set(entry.meta.id, entry);
  });
  const trash = await loadTrash(root);

  let order = await readOrder(root);
  let queue: Promise<void> = Promise.resolve();
  let lastToast = 0;

  /** Writes run serially in call order; errors toast but don't stop later writes */
  function enqueue(op: () => Promise<void>): void {
    queue = queue.then(op).catch((e: unknown) => {
      const now = Date.now();
      if (now - lastToast < TOAST_GAP) return;
      lastToast = now;
      toast(t("写入文件夹失败：{msg}", { msg: (e as Error).message }), "error");
    });
  }

  function ensureDir(relPath: string): void {
    if (!relPath) return;
    enqueue(async () => {
      if (!(await getDirectory(root, relPath, true))) throw new Error(t("建不出目录 {path}", { path: relPath }));
    });
  }

  /** After moving a whole folder, re-read each file's mtime: on disk they may be freshly copied files,
   *  and without this the next rescan would treat them all as external changes */
  function refreshMtimes(entries: Entry[]): void {
    if (!entries.length) return;
    enqueue(async () => {
      for (const e of entries) e.mtime = await fileMtime(root, e.relPath);
    });
  }

  const ctx: VaultCtx = {
    root,
    docs,
    trash,
    cats,
    enqueue,
    flush: async () => {
      await queue;
    },
  };
  const trashOps = createTrash(ctx);
  const attachments = createAttachments(root);
  const rescan = createRescanner(ctx, attachments.clearUrls);

  const backend: VaultBackend = {
    kind: "vault",
    name: root.name,

    listDocs(): LocalDocMeta[] {
      // Must return copies: cached meta is mutated in place, so handing it out directly
      // makes the sidebar's old/new list comparison see identical objects and miss a title change
      return [...docs.values()].map((e) => ({ ...e.meta }));
    },

    getContent(id: string): string | null {
      return docs.get(id)?.content ?? null;
    },

    createDoc(init: DocInit): LocalDocMeta {
      const category = init.category?.trim() || UNCATEGORIZED;
      const content = init.content ?? "";
      const title = init.title?.slice(0, 200) || UNTITLED_DOC;
      const dirPath = catDir(category);
      const name = uniqueName(docs.values(), dirPath, sanitizeFileName(title), null);
      const relPath = join(dirPath, name);
      const now = new Date().toISOString();
      const meta: LocalDocMeta = {
        id: uniqueDocId(docs, relPath),
        // Filename is the title: after sanitizing and de-duplicating, the on-disk name wins so it's stable across reopen
        title: stripMd(name),
        category,
        createdAt: now,
        updatedAt: now,
        ...summarize(content),
      };
      // Cache a copy and give the caller its own (later changes shouldn't leak back through the reference);
      // mtime stays 0 until the queued write lands, then gets backfilled
      const entry: Entry = { meta: { ...meta }, content, relPath, mtime: 0 };
      docs.set(meta.id, entry);
      if (dirPath) addCat(cats, category);
      enqueue(async () => {
        const dir = await getDirectory(root, dirPath, true);
        if (!dir) throw new Error(t("建不出目录 {path}", { path: dirPath }));
        entry.mtime = await writeTextFile(dir, name, content);
      });
      return meta;
    },

    updateDoc(id: string, patch: DocPatch): boolean {
      const e = docs.get(id);
      if (!e) return false;
      const oldRel = e.relPath;
      // Resolve the target folder before the filename: clashes are per target folder, and a title+category change moves only once
      let dirPath = parentPath(oldRel);
      let name = baseName(oldRel);
      if (patch.category !== undefined) {
        const category = patch.category.trim() || UNCATEGORIZED;
        e.meta.category = category;
        dirPath = catDir(category);
        if (dirPath) addCat(cats, category);
      }
      if (patch.title !== undefined) {
        const title = patch.title.slice(0, 200) || UNTITLED_DOC;
        name = uniqueName(docs.values(), dirPath, sanitizeFileName(title), id);
      } else if (dirPath !== parentPath(oldRel)) {
        name = uniqueName(docs.values(), dirPath, stripMd(name), id);
      }
      // Filename is the title: after sanitizing/de-duplicating, the on-disk name wins, matching what a reopen reads
      e.meta.title = stripMd(name);
      if (patch.content !== undefined) {
        e.content = patch.content;
        Object.assign(e.meta, summarize(patch.content));
      }
      // Moving categories alone isn't an edit; don't bump the timestamp
      if (patch.title !== undefined || patch.content !== undefined) {
        e.meta.updatedAt = new Date().toISOString();
      }
      const relPath = join(dirPath, name);
      if (relPath !== oldRel) {
        // moveFile creates the target folder as needed
        e.relPath = relPath;
        enqueue(async () => {
          e.mtime = await moveFile(root, oldRel, relPath);
        });
      }
      if (patch.content !== undefined) {
        const text = patch.content;
        // The path was already moved by the previous queued task; write to the new location
        enqueue(async () => {
          const dir = await getDirectory(root, parentPath(relPath), true);
          if (!dir) throw new Error(t("建不出目录 {path}", { path: parentPath(relPath) }));
          e.mtime = await writeTextFile(dir, baseName(relPath), text);
        });
      }
      return true;
    },

    /** Delete doesn't really delete: move into .trash so the file stays on disk and can be restored */
    deleteDoc(id: string) {
      const e = docs.get(id);
      if (!e) return;
      docs.delete(id);
      trashOps.moveToTrash(e);
    },

    listCats(): string[] {
      return [...cats];
    },

    /** Only creates folders for new categories; never deletes folders here (deletion goes through removeCategory) */
    saveCats(next: string[]) {
      for (const raw of next) {
        const cat = raw.trim();
        if (!cat || cat === UNCATEGORIZED || cats.has(cat)) continue;
        addCat(cats, cat);
        ensureDir(cat);
      }
    },

    relocateCategory(from: string, to: string) {
      const remap = (c: string) =>
        c === from ? to : c.startsWith(`${from}/`) ? to + c.slice(from.length) : c;
      const moved: Entry[] = [];
      for (const e of docs.values()) {
        const cat = e.meta.category || UNCATEGORIZED;
        const next = remap(cat);
        if (next === cat) continue;
        // Files move with the folder, no per-file move needed; category-only changes don't bump updatedAt
        e.meta.category = next;
        e.relPath = join(catDir(next), baseName(e.relPath));
        moved.push(e);
      }
      const remapped = [...cats].map(remap);
      cats.clear();
      for (const c of remapped) cats.add(c);
      addCat(cats, to);
      ensureDir(parentPath(to));
      enqueue(() => moveDirectory(root, from, to));
      refreshMtimes(moved);
    },

    removeCategory(path: string) {
      const inSub = (c: string) => c === path || c.startsWith(`${path}/`);
      for (const e of docs.values()) {
        if (!inSub(e.meta.category || UNCATEGORIZED)) continue;
        e.meta.category = UNCATEGORIZED;
        const oldRel = e.relPath;
        const relPath = uniqueName(docs.values(), "", stripMd(baseName(oldRel)), e.meta.id);
        e.relPath = relPath;
        enqueue(async () => {
          e.mtime = await moveFile(root, oldRel, relPath);
        });
      }
      for (const c of [...cats]) if (inSub(c)) cats.delete(c);
      enqueue(async () => {
        const parent = await getDirectory(root, parentPath(path), false);
        if (parent) await removeEntry(parent, baseName(path), true);
      });
    },

    loadOrder(): unknown {
      return order;
    },

    saveOrder(o: unknown) {
      order = o;
      enqueue(async () => {
        const dir = await getDirectory(root, ORDER_DIR, true);
        if (!dir) throw new Error(t("建不出目录 {path}", { path: ORDER_DIR }));
        await writeTextFile(dir, ORDER_FILE, JSON.stringify(o));
      });
    },

    async flush() {
      await queue;
    },

    rescan,
    listTrash: trashOps.listTrash,
    restoreFromTrash: trashOps.restoreFromTrash,
    purgeFromTrash: trashOps.purgeFromTrash,
    emptyTrash: trashOps.emptyTrash,
    saveAttachment: attachments.saveAttachment,
    getAttachmentUrl: attachments.getAttachmentUrl,
  };

  return backend;
}
