/**
 * 浏览器后端：未登录时把本地文档库存在 localStorage，索引与正文分 key。
 * 原先直接写在 @/lib/localDocs 里，现在挪到 LocalBackend 实现下，登录后由首页批量同步上云并清空。
 */

import { UNCATEGORIZED } from "@/features/workspace/constants";
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
    const meta: LocalDocMeta = {
      id: `local-${crypto.randomUUID()}`,
      title: init.title?.slice(0, 200) || "未命名文章",
      category: init.category?.trim() || UNCATEGORIZED,
      updatedAt: new Date().toISOString(),
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
    if (patch.title !== undefined) meta.title = patch.title.slice(0, 200) || "未命名文章";
    if (patch.category !== undefined) meta.category = patch.category.trim() || UNCATEGORIZED;
    if (patch.content !== undefined) {
      localStorage.setItem(DOC_PREFIX + id, patch.content);
      Object.assign(meta, summarize(patch.content));
    }
    // 仅移动分类不算编辑，不刷新时间戳
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
    for (const d of this.listDocs()) {
      const cat = d.category || UNCATEGORIZED;
      if (remap(cat) !== cat) this.updateDoc(d.id, { category: remap(cat) });
    }
    this.saveCats(Array.from(new Set([...this.listCats().map(remap), to])));
  },

  removeCategory(path: string) {
    const inSub = (c: string) => c === path || c.startsWith(`${path}/`);
    for (const d of this.listDocs()) {
      if (inSub(d.category || UNCATEGORIZED)) this.updateDoc(d.id, { category: UNCATEGORIZED });
    }
    this.saveCats(this.listCats().filter((c) => !inSub(c)));
  },
};

export function createBrowserBackend(): LocalBackend {
  return backend;
}
