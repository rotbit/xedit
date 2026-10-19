/**
 * Vault filesystem primitives: wraps only the File System Access API, no document semantics.
 * Layout is <vault>/<category path>/<title>.md: filename is the title, folder is the category, no frontmatter;
 * dot-prefixed entries (.obsidian/.xedit/.trash/.DS_Store...) are always skipped, as is the top-level attachments.
 */

import { MAX_DEPTH } from "@/features/workspace/constants";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { t } from "@/i18n/t";

// TS 5.9's lib.dom still lacks the directory picker, handle permission queries and handle.move,
// and async directory iteration is in dom.asynciterable (not in tsconfig.lib), so add minimal declarations matching Chromium
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
      id?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission?: (desc?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (desc?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
    /** Chrome 111+ only; without it fall back to read → write → delete */
    move?: (parent: FileSystemDirectoryHandle, name?: string) => Promise<void>;
  }
  interface FileSystemDirectoryHandle {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  }
}

/** Filename limit: leaves headroom under 255-byte filesystems (CJK is 3 bytes per char) */
const MAX_NAME = 120;

/** Attachment folder: fixed as attachments under the library root. It's neither a category nor holds articles,
 *  just images and other binaries, so the scan skips it entirely at the top level (same-named folders deeper still count as categories) */
export const ATTACHMENTS_DIR = "attachments";

/** Read 16 files concurrently: more just piles up file handles */
const READ_CHUNK = 16;

/** Illegal or unsafe filename characters: control chars, path separators and Windows reserved symbols */
const ILLEGAL = /[\x00-\x1f\x7f/\\:*?"<>|]/g;

export const baseName = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
export const parentPath = (p: string): string =>
  p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";

export function isVaultSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Returns null if the user cancels; other errors (e.g. insecure context) are thrown */
export async function pickVaultDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window === "undefined" || !window.showDirectoryPicker) return null;
  try {
    return await window.showDirectoryPicker({ mode: "readwrite", id: "xedit-vault" });
  } catch (e) {
    if ((e as DOMException | null)?.name === "AbortError") return null;
    throw e;
  }
}

export async function queryVaultPermission(
  handle: FileSystemDirectoryHandle
): Promise<PermissionState> {
  // If permissions can't be queried assume granted; a real write failure will surface anyway
  if (!handle.queryPermission) return "granted";
  return await handle.queryPermission({ mode: "readwrite" });
}

/** Must be called within a user gesture, or the browser refuses outright */
export async function requestVaultPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if (!handle.requestPermission) return true;
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

/** Title → valid filename (no extension): illegal chars become -, trailing dots and spaces are stripped (Windows rejects them) */
export function sanitizeFileName(title: string): string {
  let name = title.trim().replace(ILLEGAL, "-").replace(/\s+/g, " ").replace(/[.\s]+$/, "");
  if (name.length > MAX_NAME) name = name.slice(0, MAX_NAME).replace(/[.\s]+$/, "");
  return name || UNTITLED_DOC;
}

export interface VaultFileEntry {
  /** /-joined path relative to the vault root */
  path: string;
  handle: FileSystemFileHandle;
}

export interface WalkOptions {
  /** Also include top-level dot entries and attachments: used when scanning inside .trash
   *  (the trash holds ordinary category folders and articles); leave off for the main library */
  includeDotRoot?: boolean;
}

/** Recursively scan a folder: only .md files are articles, but every non-dot folder (even empty) is a category.
 *  Returned paths are relative to the folder passed in, not the library root */
export async function walkDirectory(
  dir: FileSystemDirectoryHandle,
  opts: WalkOptions = {}
): Promise<{ files: VaultFileEntry[]; dirs: string[] }> {
  const files: VaultFileEntry[] = [];
  const dirs: string[] = [];
  const walk = async (d: FileSystemDirectoryHandle, prefix: string, depth: number) => {
    // The two top-level filters (dot entries, attachment folder) are turned off when scanning inside .trash
    const filterTop = depth > 0 || !opts.includeDotRoot;
    for await (const [name, handle] of d.entries()) {
      if (name.startsWith(".") && filterTop) continue;
      if (depth === 0 && filterTop && name === ATTACHMENTS_DIR) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "directory") {
        dirs.push(path);
        if (depth + 1 < MAX_DEPTH) {
          await walk(handle as FileSystemDirectoryHandle, path, depth + 1);
        }
      } else if (name.toLowerCase().endsWith(".md")) {
        files.push({ path, handle: handle as FileSystemFileHandle });
      }
    }
  };
  await walk(dir, "", 0);
  return { files, dirs };
}

/** Scan the whole library: skip top-level dot folders (.obsidian/.xedit/.trash...) and attachments */
export async function walkVault(
  root: FileSystemDirectoryHandle
): Promise<{ files: VaultFileEntry[]; dirs: string[] }> {
  return await walkDirectory(root);
}

/** Read contents in batches of 16 concurrent reads: fast enough without opening every handle in the library at once.
 *  Files where needText returns false get only mtime, not the body (unchanged files during rescan), with text = null */
export async function readVaultFiles(
  files: readonly VaultFileEntry[],
  onFile: (path: string, mtime: number, text: string | null) => void,
  needText?: (path: string, mtime: number) => boolean
): Promise<void> {
  for (let i = 0; i < files.length; i += READ_CHUNK) {
    const read = await Promise.all(
      files.slice(i, i + READ_CHUNK).map(async (f) => {
        const file = await f.handle.getFile();
        const mtime = file.lastModified;
        return {
          path: f.path,
          mtime,
          text: !needText || needText(f.path, mtime) ? await file.text() : null,
        };
      })
    );
    for (const r of read) onFile(r.path, r.mtime, r.text);
  }
}

/** Empty relPath means the root; with create, failure to create throws; read-only lookups return null if missing */
export async function getDirectory(
  root: FileSystemDirectoryHandle,
  relPath: string,
  create: boolean
): Promise<FileSystemDirectoryHandle | null> {
  let dir = root;
  for (const seg of relPath.split("/").filter(Boolean)) {
    try {
      dir = await dir.getDirectoryHandle(seg, { create });
    } catch (e) {
      if (!create) return null;
      throw e;
    }
  }
  return dir;
}

/** Re-read file.lastModified after writing and return it: callers store it in entry.mtime
 *  so rescans don't mistake our own fresh writes for external changes */
async function writeData(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: string | Blob
): Promise<number> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try {
    await w.write(data);
    await w.close();
  } catch (e) {
    // On mid-write failure abort this write rather than leave a truncated file
    await w.abort().catch(() => undefined);
    throw e;
  }
  return (await fh.getFile()).lastModified;
}

/** Returns the file mtime after writing */
export async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  text: string
): Promise<number> {
  return await writeData(dir, name, text);
}

/** Write binaries like images as raw Blobs, never through a string */
export async function writeBlobFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  blob: Blob
): Promise<number> {
  return await writeData(dir, name, blob);
}

export async function readTextFile(handle: FileSystemFileHandle): Promise<string> {
  return await (await handle.getFile()).text();
}

export async function removeEntry(
  dir: FileSystemDirectoryHandle,
  name: string,
  recursive = false
): Promise<void> {
  await dir.removeEntry(name, { recursive });
}

/** Read the mtime of the file at a relative path; 0 if not on disk */
export async function fileMtime(
  root: FileSystemDirectoryHandle,
  relPath: string
): Promise<number> {
  const dir = await getDirectory(root, parentPath(relPath), false);
  if (!dir) return 0;
  try {
    return (await (await dir.getFileHandle(baseName(relPath))).getFile()).lastModified;
  } catch {
    return 0;
  }
}

/** Rename/move: use native move if available, else read + write + delete. Returns the file mtime at the new location */
export async function moveFile(
  root: FileSystemDirectoryHandle,
  fromRel: string,
  toRel: string
): Promise<number> {
  if (fromRel === toRel) return await fileMtime(root, toRel);
  const fromDir = await getDirectory(root, parentPath(fromRel), false);
  if (!fromDir) throw new Error(t("找不到目录 {path}", { path: parentPath(fromRel) || "/" }));
  const toDir = await getDirectory(root, parentPath(toRel), true);
  if (!toDir) throw new Error(t("建不出目录 {path}", { path: parentPath(toRel) || "/" }));
  const fromName = baseName(fromRel);
  const toName = baseName(toRel);
  const fh = await fromDir.getFileHandle(fromName);
  if (typeof fh.move === "function") {
    await fh.move(toDir, toName);
    // After native move the handle already points to the new location
    return (await fh.getFile()).lastModified;
  }
  const mtime = await copyFile(fh, toDir, toName);
  await fromDir.removeEntry(fromName);
  return mtime;
}

/** Rename/move a folder: native move only handles files, so folders are copied as a whole tree then the source removed */
export async function moveDirectory(
  root: FileSystemDirectoryHandle,
  fromRel: string,
  toRel: string
): Promise<void> {
  if (fromRel === toRel) return;
  if (toRel.startsWith(`${fromRel}/`)) throw new Error(t("不能把文件夹搬进它自己里"));
  const from = await getDirectory(root, fromRel, false);
  if (!from) return; // Source folder isn't on disk at all (only in the index); nothing to move
  const to = await getDirectory(root, toRel, true);
  if (!to) throw new Error(t("建不出目录 {path}", { path: toRel }));
  await copyDir(from, to);
  const fromParent = await getDirectory(root, parentPath(fromRel), false);
  await fromParent?.removeEntry(baseName(fromRel), { recursive: true });
}

/** Copy as a raw Blob so binary attachments like images aren't mangled as text */
async function copyFile(
  fh: FileSystemFileHandle,
  toDir: FileSystemDirectoryHandle,
  name: string
): Promise<number> {
  return await writeData(toDir, name, await fh.getFile());
}

/** Copy the whole tree, dot entries included: moving a folder must bring its attachments along */
async function copyDir(
  from: FileSystemDirectoryHandle,
  to: FileSystemDirectoryHandle
): Promise<void> {
  for await (const [name, handle] of from.entries()) {
    if (handle.kind === "directory") {
      const sub = await to.getDirectoryHandle(name, { create: true });
      await copyDir(handle as FileSystemDirectoryHandle, sub);
    } else {
      await copyFile(handle as FileSystemFileHandle, to, name);
    }
  }
}
