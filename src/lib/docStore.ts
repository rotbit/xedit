/**
 * 云端文档的本地镜像库（完全本地优先的核心）：
 * 登录后所有云端文章在 localStorage 建镜像，读写永远先落镜像，
 * 云端只是同步目标——离线时列表、阅读、编辑全部照常，联网后由 sync 引擎推拉。
 */

import { summarize } from "./localDocs";

export interface MirrorMeta {
  id: string;
  title: string;
  category?: string;
  updatedAt: string;
  excerpt?: string;
  chars?: number;
  /** 本地有云端未落盘的修改 */
  dirty?: boolean;
}

export interface ServerDoc {
  id: string;
  title: string;
  category?: string | null;
  updatedAt: string;
  content: string;
}

const INDEX_KEY = "xedit-mirror-index";
const DOC_PREFIX = "xedit-mirror-doc:";
const AUTHED_KEY = "xedit-was-authed";

function readIndex(): MirrorMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeIndex(list: MirrorMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

export function listMirrorDocs(): MirrorMeta[] {
  return readIndex().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getMirrorMeta(id: string): MirrorMeta | null {
  return readIndex().find((d) => d.id === id) ?? null;
}

export function getMirrorContent(id: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DOC_PREFIX + id);
}

/**
 * 本地编辑落镜像：立即写入并标 dirty，由 sync 引擎稍后推送云端。
 * dirty=false 用于「云端已确认」的元数据修正（如在线移动分类成功后）。
 */
export function saveMirrorLocal(
  id: string,
  patch: { title?: string; content?: string; category?: string },
  dirty = true
) {
  const list = readIndex();
  let meta = list.find((d) => d.id === id);
  if (!meta) {
    meta = { id, title: "未命名文章", updatedAt: new Date().toISOString() };
    list.unshift(meta);
  }
  if (patch.title !== undefined) meta.title = patch.title.slice(0, 200) || "未命名文章";
  if (patch.category !== undefined) meta.category = patch.category.trim() || "未分类";
  if (patch.content !== undefined) {
    localStorage.setItem(DOC_PREFIX + id, patch.content);
    Object.assign(meta, summarize(patch.content));
  }
  meta.updatedAt = new Date().toISOString();
  if (dirty) meta.dirty = true;
  writeIndex(list);
}

/** 云端文档落镜像；本地有未推送修改（dirty）时跳过，本地优先 */
export function applyServerDoc(doc: ServerDoc) {
  const list = readIndex();
  const existing = list.find((d) => d.id === doc.id);
  if (existing?.dirty) return;
  const meta: MirrorMeta = {
    id: doc.id,
    title: doc.title,
    category: doc.category ?? "未分类",
    updatedAt:
      typeof doc.updatedAt === "string" ? doc.updatedAt : new Date(doc.updatedAt).toISOString(),
    ...summarize(doc.content),
  };
  localStorage.setItem(DOC_PREFIX + doc.id, doc.content);
  if (existing) Object.assign(existing, meta, { dirty: false });
  else list.unshift(meta);
  writeIndex(list);
}

/** 推送成功后清 dirty */
export function markMirrorSynced(id: string, serverUpdatedAt?: string) {
  const list = readIndex();
  const meta = list.find((d) => d.id === id);
  if (!meta) return;
  meta.dirty = false;
  if (serverUpdatedAt) meta.updatedAt = serverUpdatedAt;
  writeIndex(list);
}

/** 对齐服务端列表：服务端已不存在（删除/移入回收站）且本地无修改的镜像一并移除 */
export function reconcileMirror(serverIds: Set<string>) {
  const list = readIndex();
  const keep = list.filter((d) => serverIds.has(d.id) || d.dirty);
  for (const d of list) {
    if (!serverIds.has(d.id) && !d.dirty) localStorage.removeItem(DOC_PREFIX + d.id);
  }
  if (keep.length !== list.length) writeIndex(keep);
}

export function removeMirrorDoc(id: string) {
  localStorage.removeItem(DOC_PREFIX + id);
  writeIndex(readIndex().filter((d) => d.id !== id));
}

export function listDirtyMirrorDocs(): MirrorMeta[] {
  return readIndex().filter((d) => d.dirty);
}

/** 登出时清空镜像，避免下一个账号看到上一个账号的文章 */
export function clearMirror() {
  for (const d of readIndex()) localStorage.removeItem(DOC_PREFIX + d.id);
  localStorage.removeItem(INDEX_KEY);
  localStorage.removeItem(AUTHED_KEY);
}

/** 「曾登录」标志：离线时 next-auth 拿不到会话，用它兜底进入离线工作区而非落地页 */
export function wasAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AUTHED_KEY) === "1";
}

export function setWasAuthed() {
  localStorage.setItem(AUTHED_KEY, "1");
}
