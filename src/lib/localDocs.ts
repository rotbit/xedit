/**
 * 本地文档库：未登录时的 Obsidian 式本地优先存储。
 *
 * 这里只是门面：具体存储由 `@/lib/localBackend` 的后端实现（默认 localStorage，
 * 后续可换成磁盘 Vault），门面负责统一排序与「本机数据变了」的广播。
 */

import { getLocalBackend, type LocalDocMeta } from "./localBackend";

export { summarize } from "./localBackend";
export type { LocalDocMeta };

/**
 * 本地文档库/云端镜像有写入时广播，供文库列表即时刷新（如编辑中改标题，侧栏跟着变）。
 * 同步引擎的整轮完成另有 SYNC_DONE_EVENT，这个事件只表示「本机数据变了」。
 */
export const DOCS_CHANGED_EVENT = "xedit:docs-changed";

export function notifyDocsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DOCS_CHANGED_EVENT));
}

/**
 * 当前打开的文档内容被整份换掉（如磁盘文件被外部改动后重新读入）：
 * 编辑器听到后重挂载一次，CodeMirror 的文档才会换成 store 里的新内容。
 */
export const DOC_REPLACED_EVENT = "xedit:doc-replaced";

export function notifyDocReplaced(docId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DOC_REPLACED_EVENT, { detail: docId }));
}

/** local- 前缀区分本地文档与云端 cuid */
export const isLocalId = (id: string | null | undefined): boolean =>
  typeof id === "string" && id.startsWith("local-");

export function listLocalDocs(): LocalDocMeta[] {
  return [...getLocalBackend().listDocs()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getLocalDocContent(id: string): string | null {
  return getLocalBackend().getContent(id);
}

export function createLocalDoc(init: {
  title?: string;
  content?: string;
  category?: string;
}): LocalDocMeta {
  return getLocalBackend().createDoc(init);
}

export function updateLocalDoc(
  id: string,
  patch: { title?: string; content?: string; category?: string }
) {
  if (getLocalBackend().updateDoc(id, patch)) notifyDocsChanged();
}

export function deleteLocalDoc(id: string) {
  getLocalBackend().deleteDoc(id);
}

export function listLocalCats(): string[] {
  return getLocalBackend().listCats();
}

export function saveLocalCats(cats: string[]) {
  getLocalBackend().saveCats(cats);
}
