/**
 * 本地文档库：未登录时的 Obsidian 式本地优先存储。
 * 索引与正文分 key 存 localStorage，登录后由首页批量同步上云并清空。
 */

import { wordCount } from "@/lib/wordCount";

export interface LocalDocMeta {
  id: string;
  title: string;
  category?: string;
  updatedAt: string;
  excerpt?: string;
  chars?: number;
}

const INDEX_KEY = "xedit-local-docs";
const DOC_PREFIX = "xedit-local-doc:";
const CATS_KEY = "xedit-local-cats";

/**
 * 本地文档库/云端镜像有写入时广播，供文库列表即时刷新（如编辑中改标题，侧栏跟着变）。
 * 同步引擎的整轮完成另有 SYNC_DONE_EVENT，这个事件只表示「本机数据变了」。
 */
export const DOCS_CHANGED_EVENT = "xedit:docs-changed";

export function notifyDocsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DOCS_CHANGED_EVENT));
}

/** local- 前缀区分本地文档与云端 cuid */
export const isLocalId = (id: string | null | undefined): boolean =>
  typeof id === "string" && id.startsWith("local-");

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

/** 摘要与字数口径与服务端列表接口保持一致。
 *  摘要只要前 90 个字，先截前 2000 字符再跑正则（服务端同款），别把整篇长文扫 5 遍 */
export function summarize(content: string): { excerpt: string; chars: number } {
  const plain = content
    .slice(0, 2000)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`~$|-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { excerpt: plain.slice(0, 90), chars: wordCount(content) };
}

export function listLocalDocs(): LocalDocMeta[] {
  return readIndex().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getLocalDocContent(id: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DOC_PREFIX + id);
}

export function createLocalDoc(init: {
  title?: string;
  content?: string;
  category?: string;
}): LocalDocMeta {
  const content = init.content ?? "";
  const meta: LocalDocMeta = {
    id: `local-${crypto.randomUUID()}`,
    title: init.title?.slice(0, 200) || "未命名文章",
    category: init.category?.trim() || "未分类",
    updatedAt: new Date().toISOString(),
    ...summarize(content),
  };
  localStorage.setItem(DOC_PREFIX + meta.id, content);
  writeIndex([meta, ...readIndex()]);
  return meta;
}

export function updateLocalDoc(
  id: string,
  patch: { title?: string; content?: string; category?: string }
) {
  const list = readIndex();
  const meta = list.find((d) => d.id === id);
  if (!meta) return;
  if (patch.title !== undefined) meta.title = patch.title.slice(0, 200) || "未命名文章";
  if (patch.category !== undefined) meta.category = patch.category.trim() || "未分类";
  if (patch.content !== undefined) {
    localStorage.setItem(DOC_PREFIX + id, patch.content);
    Object.assign(meta, summarize(patch.content));
  }
  // 仅移动分类不算编辑，不刷新时间戳
  if (patch.title !== undefined || patch.content !== undefined) {
    meta.updatedAt = new Date().toISOString();
  }
  writeIndex(list);
  notifyDocsChanged();
}

export function deleteLocalDoc(id: string) {
  localStorage.removeItem(DOC_PREFIX + id);
  writeIndex(readIndex().filter((d) => d.id !== id));
}

export function listLocalCats(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(CATS_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

export function saveLocalCats(cats: string[]) {
  localStorage.setItem(CATS_KEY, JSON.stringify(cats));
}
