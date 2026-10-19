/**
 * Browser backend: when logged out, the local document library lives in localStorage, with index and bodies under separate keys.
 * This used to live directly in @/lib/localDocs; now it's a LocalBackend implementation, synced to the cloud in bulk and cleared by the home page after login.
 */

import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";
import {
  summarize,
  type DocInit,
  type DocPatch,
  type LocalBackend,
  type LocalDocMeta,
} from "./types";

const INDEX_KEY = "xedit-local-docs";
const DOC_PREFIX = "xedit-local-doc:";
const CATS_KEY = "xedit-local-cats";

function readIndex(): LocalDocMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeIndex(list: LocalDocMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

/**
 * Batch-update the index: read it once, apply all entry changes in memory, write back at most once.
 * Moving/deleting a category touches the whole library; going through updateDoc per document would
 * deserialize and reserialize the whole index each time, which is O(n²).
 */
function patchIndex(patch: (meta: LocalDocMeta) => boolean): void {
  const list = readIndex();
  let dirty = false;
  for (const meta of list) {
    if (patch(meta)) dirty = true;
  }
  if (dirty) writeIndex(list);
}

const backend: LocalBackend = {
  kind: "browser",

  listDocs(): LocalDocMeta[] {
    return readIndex();
  },

  getContent(id: string): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(DOC_PREFIX + id);
  },

  createDoc(init: DocInit): LocalDocMeta {
    const content = init.content ?? "";
    const now = new Date().toISOString();
    const meta: LocalDocMeta = {
      id: `local-${crypto.randomUUID()}`,
      title: init.title?.slice(0, 200) || UNTITLED_DOC,
      category: init.category?.trim() || UNCATEGORIZED,
      createdAt: now,
      updatedAt: now,
      ...summarize(content),
    };
    localStorage.setItem(DOC_PREFIX + meta.id, content);
    writeIndex([meta, ...readIndex()]);
    return meta;
  },

  updateDoc(id: string, patch: DocPatch): boolean {
    const list = readIndex();
    const meta = list.find((d) => d.id === id);
    if (!meta) return false;
    if (patch.title !== undefined) meta.title = patch.title.slice(0, 200) || UNTITLED_DOC;
    if (patch.category !== undefined) meta.category = patch.category.trim() || UNCATEGORIZED;
    if (patch.content !== undefined) {
      localStorage.setItem(DOC_PREFIX + id, patch.content);
      Object.assign(meta, summarize(patch.content));
    }
    // Moving categories alone isn't an edit; don't bump the timestamp
    if (patch.title !== undefined || patch.content !== undefined) {
      meta.updatedAt = new Date().toISOString();
    }
    writeIndex(list);
    return true;
  },

  deleteDoc(id: string) {
    localStorage.removeItem(DOC_PREFIX + id);
    writeIndex(readIndex().filter((d) => d.id !== id));
  },

  listCats(): string[] {
    if (typeof window === "undefined") return [];
    try {
      const list = JSON.parse(localStorage.getItem(CATS_KEY) ?? "[]");
      return Array.isArray(list) ? list.filter((c): c is string => typeof c === "string") : [];
    } catch {
      return [];
    }
  },

  saveCats(cats: string[]) {
    localStorage.setItem(CATS_KEY, JSON.stringify(cats));
  },

  relocateCategory(from: string, to: string) {
    const remap = (c: string) =>
      c === from ? to : c.startsWith(`${from}/`) ? to + c.slice(from.length) : c;
    // Only category changes, and the timestamp shouldn't change anyway (moving isn't editing), so the batch path works
    patchIndex((meta) => {
      const cat = meta.category || UNCATEGORIZED;
      const next = remap(cat);
      if (next === cat) return false;
      meta.category = next;
      return true;
    });
    this.saveCats(Array.from(new Set([...this.listCats().map(remap), to])));
  },

  removeCategory(path: string) {
    const inSub = (c: string) => c === path || c.startsWith(`${path}/`);
    patchIndex((meta) => {
      if (!inSub(meta.category || UNCATEGORIZED)) return false;
      meta.category = UNCATEGORIZED;
      return true;
    });
    this.saveCats(this.listCats().filter((c) => !inSub(c)));
  },
};

export function createBrowserBackend(): LocalBackend {
  return backend;
}
