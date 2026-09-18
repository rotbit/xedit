/**
 * 云端文档的本地镜像库（完全本地优先的核心）：
 * 登录后所有云端文章在 localStorage 建镜像，读写永远先落镜像，
 * 云端只是同步目标——离线时列表、阅读、编辑全部照常，联网后由 sync 引擎推拉。
 */

import { clearAuthSnapshot } from "./authSnapshot";
import { notifyDocsChanged, summarize } from "./localDocs";
import { bumpSessionEpoch } from "./sessionEpoch";
import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";

export interface MirrorMeta {
  id: string;
  title: string;
  category?: string;
  updatedAt: string;
  excerpt?: string;
  chars?: number;
  /** 本地有云端未落盘的修改 */
  dirty?: boolean;
  /**
   * 本地修订号：每次 saveMirrorLocal 自增，从 1 起。老索引没有这个字段，按 0 算。
   * 推送时记下发出的 rev，响应回来只有 rev 没变才清 dirty——
   * 否则「慢响应清掉了它出发之后的新编辑」，那几个字就再也推不上去了。
   */
  rev?: number;
  /**
   * 本地这份副本派生自的服务端 updatedAt。PUT 带上它，服务端据此判冲突：
   * 别人（另一台设备 / MCP）在这中间改过，服务端回 409 而不是闷头覆盖。
   */
  baseUpdatedAt?: string;
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
/** 增量同步游标：上次成功拉取时见到的最大 updatedAt（服务端时间，ISO 串） */
export const SYNC_CURSOR_KEY = "xedit-sync-cursor";

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

/** 当前本地修订号；没有这个字段的老索引按 0 算 */
export function getMirrorRev(id: string): number {
  return getMirrorMeta(id)?.rev ?? 0;
}

/**
 * 本地编辑落镜像：立即写入并标 dirty，由 sync 引擎稍后推送云端。
 * dirty=false 用于「云端已确认」的元数据修正（如在线移动分类成功后）。
 *
 * 写失败（配额满）一律抛出、不吞：调用方要据此提示用户，内容还在编辑器里没丢。
 * 顺序是先正文后索引，正文写不进去索引就一个字节都不动，不会留下
 * 「索引说有 5000 字、正文还是旧的」这种半截状态。
 */
export function saveMirrorLocal(
  id: string,
  patch: { title?: string; content?: string; category?: string },
  dirty = true
) {
  const list = readIndex();
  let meta = list.find((d) => d.id === id);
  if (!meta) {
    meta = { id, title: UNTITLED_DOC, updatedAt: new Date().toISOString() };
    list.unshift(meta);
  }
  // 正文先落盘：这一步抛了，下面的索引改动只活在这个临时数组里，本地状态没被动过
  if (patch.content !== undefined) localStorage.setItem(DOC_PREFIX + id, patch.content);
  if (patch.title !== undefined) meta.title = patch.title.slice(0, 200) || UNTITLED_DOC;
  if (patch.category !== undefined) meta.category = patch.category.trim() || UNCATEGORIZED;
  if (patch.content !== undefined) Object.assign(meta, summarize(patch.content));
  meta.updatedAt = new Date().toISOString();
  meta.rev = (meta.rev ?? 0) + 1;
  if (dirty) meta.dirty = true;
  writeIndex(list);
  notifyDocsChanged();
}

/** 云端文档落镜像；本地有未推送修改（dirty）时跳过，本地优先 */
export function applyServerDoc(doc: ServerDoc) {
  applyServerDocs([doc]);
}

export interface ApplyServerDocsResult {
  /** 真正写进镜像的篇数 */
  applied: number;
  /** 本地更新（dirty）或内容完全一致而跳过的篇数 */
  skipped: number;
  /** 正文写失败（配额满）的文档 id，这些篇不会进索引 */
  failed: string[];
}

/**
 * 整批云端文档落镜像。全量同步一次几百篇，逐篇走 applyServerDoc 的话
 * 索引要反序列化 + 序列化几百遍（O(n²)），列表也会被广播刷几百次：
 * 这里整批只读一次索引、写一次、广播一次。
 *
 * 本地优先的规矩不变：dirty 的跳过；与镜像逐字段相同的也跳过，不白写一遍正文。
 * 单篇正文写失败（配额满）记进 failed 继续处理其余篇，索引只包含真正写成功的。
 */
export function applyServerDocs(docs: ServerDoc[]): ApplyServerDocsResult {
  const list = readIndex();
  const byId = new Map(list.map((d) => [d.id, d]));
  const result: ApplyServerDocsResult = { applied: 0, skipped: 0, failed: [] };
  for (const doc of docs) {
    const existing = byId.get(doc.id);
    if (existing?.dirty) {
      result.skipped++;
      continue;
    }
    const updatedAt =
      typeof doc.updatedAt === "string" ? doc.updatedAt : new Date(doc.updatedAt).toISOString();
    const category = doc.category ?? UNCATEGORIZED;
    if (
      existing &&
      existing.title === doc.title &&
      existing.category === category &&
      existing.updatedAt === updatedAt &&
      existing.baseUpdatedAt === updatedAt &&
      getMirrorContent(doc.id) === doc.content
    ) {
      result.skipped++;
      continue;
    }
    try {
      localStorage.setItem(DOC_PREFIX + doc.id, doc.content);
    } catch {
      result.failed.push(doc.id);
      continue;
    }
    const next: MirrorMeta = {
      id: doc.id,
      title: doc.title,
      category,
      updatedAt,
      // 本地这份从此派生自服务端这个版本，下次 PUT 带它去判冲突
      baseUpdatedAt: updatedAt,
      rev: existing?.rev ?? 0,
      ...summarize(doc.content),
    };
    if (existing) Object.assign(existing, next, { dirty: false });
    else {
      list.unshift(next);
      byId.set(doc.id, next);
    }
    result.applied++;
  }
  if (result.applied > 0) {
    writeIndex(list);
    notifyDocsChanged();
  }
  return result;
}

/**
 * 推送成功后清 dirty。
 *
 * confirmedRev 是这次推送出发时镜像的 rev：不相等说明请求在途时用户又改了，
 * 这次响应只确认了旧内容，dirty 必须留着（那轮编辑还等着推）。
 * 不论相不相等，baseUpdatedAt 都记成服务端版本——本地确实见过这个版本了，
 * 下一次 PUT 带它去才不会被判成冲突。
 *
 * @returns 是否真的清掉了 dirty
 */
export function markMirrorSynced(
  id: string,
  confirmedRev: number,
  serverUpdatedAt?: string
): boolean {
  const list = readIndex();
  const meta = list.find((d) => d.id === id);
  if (!meta) return false;
  const confirmed = (meta.rev ?? 0) === confirmedRev;
  if (confirmed) {
    meta.dirty = false;
    // PUT 响应带回服务端 updatedAt：镜像记服务器时间，
    // 本机时钟快的机器才不会把自己刚存的内容误判成「云端有更新」
    if (serverUpdatedAt) meta.updatedAt = serverUpdatedAt;
  }
  if (serverUpdatedAt) meta.baseUpdatedAt = serverUpdatedAt;
  writeIndex(list);
  return confirmed;
}

/** 只把「本地副本基于的服务端版本」改掉，dirty 与正文都不动（冲突解决后重推用） */
export function rebaseMirror(id: string, serverUpdatedAt: string) {
  const list = readIndex();
  const meta = list.find((d) => d.id === id);
  if (!meta) return;
  meta.baseUpdatedAt = serverUpdatedAt;
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

/** 登出时清空镜像，避免下一个账号看到上一个账号的文章；本机账号快照一并清掉 */
export function clearMirror() {
  for (const d of readIndex()) localStorage.removeItem(DOC_PREFIX + d.id);
  localStorage.removeItem(INDEX_KEY);
  localStorage.removeItem(SYNC_CURSOR_KEY);
  clearAuthSnapshot();
  // 代际 +1：上一个账号还在飞的推拉请求回来时会发现代际变了，结果直接丢弃，
  // 不会把上一个账号的内容写进刚清空的镜像里
  bumpSessionEpoch();
}
