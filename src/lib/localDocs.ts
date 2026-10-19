/**
 * Local document library: Obsidian-style local-first storage when logged out.
 *
 * This is just a facade: storage is implemented by a backend in `@/lib/localBackend` (localStorage by default,
 * or the disk Vault); the facade handles uniform sorting and the "local data changed" broadcast.
 */

import { getLocalBackend, type LocalDocMeta } from "./localBackend";

export { summarize } from "./localBackend";
export type { LocalDocMeta };

/**
 * Broadcast on writes to the local library/cloud mirror so library lists refresh immediately (e.g. renaming while editing updates the sidebar).
 * A full sync round completing has its own SYNC_DONE_EVENT; this event only means "local data changed".
 */
export const DOCS_CHANGED_EVENT = "xedit:docs-changed";

export function notifyDocsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DOCS_CHANGED_EVENT));
}

/**
 * The open document's content was replaced wholesale (e.g. the disk file changed externally and was re-read):
 * the editor remounts on hearing this so CodeMirror picks up the new content from the store.
 */
export const DOC_REPLACED_EVENT = "xedit:doc-replaced";

export function notifyDocReplaced(docId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DOC_REPLACED_EVENT, { detail: docId }));
}

/** The local- prefix distinguishes local documents from cloud cuids */
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
