/** Editor persistence: maintains the save baseline for this editing session and writes to the local library or mirror for local/cloud docs, triggering sync. */

import { getMirrorContent, saveMirrorLocal } from "@/lib/docStore";
import { isLocalId, updateLocalDoc } from "@/lib/localDocs";
import { pushMirrorDoc } from "@/lib/sync";

export interface EditorDocument {
  docId: string | null;
  title: string;
  content: string;
  category: string;
}

export type PersistResult = "draft" | "local" | "local-error" | "offline" | "push-failed" | "synced";

/**
 * Save baseline for the current single-document editing session, kept across component unmounts.
 * Used when switching pages to spot unsaved edits in the store, so a mirror updated in the background doesn't overwrite input.
 * "Saved" doesn't mean the cloud confirmed it; whether it still needs syncing is decided by the mirror's dirty flag.
 */
let savedDocument: EditorDocument = { docId: null, title: "", content: "", category: "" };

export function getSavedDocument(): Readonly<EditorDocument> {
  return savedDocument;
}

export function rememberSavedDocument({ docId, title, content, category }: EditorDocument) {
  savedDocument = { docId, title, content, category };
}

export function isDocumentSaved(doc: EditorDocument): boolean {
  return savedDocument.docId === doc.docId && savedDocument.title === doc.title &&
    savedDocument.content === doc.content && savedDocument.category === doc.category;
}

/** Without a session baseline after a refresh, fall back to mirror comparison; if neither exists, keep the current edits. */
export function hasPendingContent(id: string, content: string): boolean {
  const base = savedDocument.docId === id ? savedDocument.content : getMirrorContent(id);
  return base === null || content !== base;
}

/** Shared save step; messages, save status, and version archiving are handled by callers per manual/auto save policy. */
export async function persistEditorDocument(doc: EditorDocument, onCloudPush: () => void): Promise<PersistResult> {
  const { docId, title, content, category } = doc;
  if (!docId) return "draft";
  if (isLocalId(docId)) {
    try {
      updateLocalDoc(docId, { title, content, category });
      rememberSavedDocument(doc);
      return "local";
    } catch {
      return "local-error";
    }
  }

  // Cloud docs always write to the mirror first; dirty content is handled by the sync engine after being offline or failed pushes.
  // If the mirror write fails (quota full), don't advance the save baseline: the content is still in the store and the next autosave retries.
  try {
    saveMirrorLocal(docId, { title, content, category });
  } catch {
    return "local-error";
  }
  rememberSavedDocument(doc);
  if (!navigator.onLine) return "offline";
  onCloudPush();
  return await pushMirrorDoc(docId) ? "synced" : "push-failed";
}
