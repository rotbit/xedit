/**
 * Vault document entries and shared context: conversion rules between ids, disk paths and categories live here,
 * shared by the main library (vaultBackend), trash (vaultTrash) and disk rescan (vaultRescan).
 */

import { UNCATEGORIZED } from "@/features/workspace/constants";
import { summarize, type LocalDocMeta } from "./types";
import { baseName, parentPath } from "./vaultFs";

export const ID_PREFIX = "local-v:";

/** One document in the in-memory cache: meta for the UI, content for the editor, relPath for its disk location;
 *  mtime is file.lastModified from the last time we wrote it ourselves or read it from disk;
 *  rescans use it to exclude our own writes and only pick up changes from external editors */
export type Entry = {
  meta: LocalDocMeta;
  content: string;
  relPath: string;
  mtime: number;
};

/** Session context shared by submodules: root handle + in-memory cache + write queue */
export interface VaultCtx {
  readonly root: FileSystemDirectoryHandle;
  /** Main library: id → entry, relPath relative to the library root */
  readonly docs: Map<string, Entry>;
  /** Trash: id → entry, relPath relative to the .trash folder */
  readonly trash: Map<string, Entry>;
  readonly cats: Set<string>;
  /** Serial write queue: the UI never waits on disk */
  enqueue: (op: () => Promise<void>) => void;
  /** Wait for the write queue to drain */
  flush: () => Promise<void>;
}

/** Category → relative folder path: uncategorized is the library root */
export const catDir = (cat: string): string => (cat === UNCATEGORIZED ? "" : cat);
/** Relative folder path → category: the library root is uncategorized */
export const dirCat = (dir: string): string => dir || UNCATEGORIZED;
export const join = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name);
export const stripMd = (name: string): string => name.replace(/\.md$/i, "");

/** A document read from disk: filename is the title, folder is the category, updatedAt is the file mtime only
 *  (so files edited by external editors sort correctly). Id defaults to the path; on clash the caller supplies one */
export function makeEntry(relPath: string, content: string, mtime: number, id?: string): Entry {
  return {
    relPath,
    content,
    mtime,
    meta: {
      id: id ?? ID_PREFIX + relPath,
      title: stripMd(baseName(relPath)),
      category: dirCat(parentPath(relPath)),
      updatedAt: new Date(mtime).toISOString(),
      ...summarize(content),
    },
  };
}

/** Register a category along with all its ancestors so the sidebar tree has no missing intermediate nodes */
export function addCat(cats: Set<string>, cat: string): void {
  const segs = cat.split("/").filter(Boolean);
  for (let i = 1; i <= segs.length; i++) cats.add(segs.slice(0, i).join("/"));
}

/** On a name clash in the same folder, append " 1", " 2"...; skipId is self (a rename shouldn't clash with itself) */
export function uniqueName(
  entries: Iterable<Entry>,
  dirPath: string,
  base: string,
  skipId: string | null
): string {
  const taken = new Set<string>();
  for (const e of entries) {
    if (e.meta.id !== skipId && parentPath(e.relPath) === dirPath) {
      taken.add(baseName(e.relPath).toLowerCase());
    }
  }
  let name = `${base}.md`;
  for (let n = 1; taken.has(name.toLowerCase()); n++) name = `${base} ${n}.md`;
  return name;
}

/** Ids derive from the path (local-v:<relPath>), but in-session renames change only relPath, not the id,
 *  so an old id may still claim this path; on clash append #2, #3... to keep ids unique within the session */
export function uniqueDocId(docs: Map<string, Entry>, relPath: string): string {
  const base = ID_PREFIX + relPath;
  if (!docs.has(base)) return base;
  let n = 2;
  while (docs.has(`${base}#${n}`)) n++;
  return `${base}#${n}`;
}
