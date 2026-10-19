/**
 * Which document the editor actually has mounted right now.
 *
 * Closing the reader doesn't clear docId in the store (local drafts and other logic rely on it staying),
 * so "store.docId === id" doesn't mean "the editor has it open": writing content to the store after the reader unmounts
 * has no autosave to persist it, and the change is lost. Rewrites from outside the editor, like todo write-back, should go by this.
 */

let mountedDocId: string | null = null;

/** Registered by useEditorSave on mount / switch / unmount */
export function setMountedDocId(id: string | null): void {
  mountedDocId = id;
}

export function isDocOpenInEditor(id: string): boolean {
  return mountedDocId !== null && mountedDocId === id;
}
