"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/Toast";
import { t } from "@/i18n/t";
import { getMirrorMeta, saveMirrorLocal } from "@/lib/docStore";
import { UNCATEGORIZED } from "@/lib/docDefaults";
import { isLocalId, updateLocalDoc } from "@/lib/localDocs";
import { isPushInFlight } from "@/lib/sync";
import { getSavedDocument, isDocumentSaved, persistEditorDocument, type EditorDocument, type PersistResult } from "@/lib/editor/persistence";
import { getDocContent } from "@/lib/docContent";
import { wordCount } from "@/lib/wordCount";
import { logEvent } from "@/lib/todos/events";
import { setMountedDocId } from "@/lib/editor/mounted";
import { useStore, type SaveState } from "@/store/useStore";

/** Keep both entry points' messaging: a failed manual save shows "pending sync", a failed online autosave shows an error. */
function saveStateFor(result: PersistResult, manual: boolean): SaveState {
  switch (result) {
    case "draft":
    case "local": return "local";
    // Couldn't even write locally, so it's neither "saved" nor "pending sync"; the content stays in the editor for the next attempt
    case "local-error": return "local-error";
    case "offline": return "pending";
    case "push-failed": return manual || !navigator.onLine ? "pending" : "error";
    case "synced": return "saved";
  }
}

/** Warn about local write failures only once, so a machine with a full quota doesn't get a toast every few hundred ms */
let localErrorNotified = false;

/** Last computed word count: autosave compares the old and new versions every time, so long docs only count the new one */
let counted: { content: string; count: number } | null = null;

function countOf(content: string): number {
  if (counted?.content === content) return counted.count;
  counted = { content, count: wordCount(content) };
  return counted.count;
}

/**
 * Writing log for the 「做了」 (Done) column: how many words this save added (or removed) since the last one.
 * The baseline must be read before saving -- once persistEditorDocument succeeds it resets the baseline to this content.
 * If the baseline isn't for this doc (it should have been recorded on load; this is a fallback), use the old body in storage, which hasn't been overwritten yet.
 */
function previousContent(doc: EditorDocument): string {
  const saved = getSavedDocument();
  if (saved.docId === doc.docId) return saved.content;
  return doc.docId ? getDocContent(doc.docId) : "";
}

function logWrite(doc: EditorDocument, before: string) {
  if (!doc.docId || before === doc.content) return;
  // Count the old version first (usually the one cached last time), then the new one, so the single-slot cache gets one hit and one fresh count
  const prev = countOf(before);
  const delta = countOf(doc.content) - prev;
  if (delta !== 0) logEvent({ kind: "write", docId: doc.docId, title: doc.title, chars: delta });
}

async function saveDocument(doc: EditorDocument, manual: boolean): Promise<PersistResult> {
  const before = previousContent(doc);
  const result = await persistEditorDocument(doc, () => {
    if (useStore.getState().docId === doc.docId) useStore.getState().setSaveState("saving");
  });
  if (result === "local-error") {
    if (!localErrorNotified) {
      localErrorNotified = true;
      toast(t("本地保存失败，内容仍在编辑器中"), "error");
    }
  } else {
    localErrorNotified = false;
    if (result !== "draft") logWrite(doc, before);
  }
  const store = useStore.getState();
  // The user switched away during the round trip: the status line now belongs to the new doc, so don't let the stale result overwrite it
  if (store.docId !== doc.docId) return result;
  const state = saveStateFor(result, manual);
  // Edited again during the round trip: this confirms old content, so don't show a misleading "saved";
  // let the autosave that follows right after decide the status
  const edited =
    store.title !== doc.title || store.content !== doc.content || store.category !== doc.category;
  if (state === "saved" && edited) return result;
  // After a successful manual sync keep showing "saving" until the version request finishes; drafts without a doc keep the current status.
  if (!manual || (result !== "synced" && result !== "draft")) {
    store.setSaveState(state);
  }
  return result;
}

/** Manual snapshots are only requested after a successful sync, so a failed version request never marks the saved body as failed. */
async function saveManualVersion(id: string, title: string) {
  try {
    const response = await fetch(`/api/documents/${id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "manual" }),
    });
    await response.json().catch(() => ({}));
    if (response.ok) logEvent({ kind: "version", docId: id, title });
    // No toast on success: the save status under the title already says so, and a toast over the body just gets in the way
    useStore.getState().setSaveState("saved");
  } catch {
    useStore.getState().setSaveState("saved");
    toast(t("已同步云端，版本存档失败"), "error");
  }
}

async function saveNow() {
  const doc = useStore.getState();
  const result = await saveDocument(doc, true);
  switch (result) {
    // Success results stay silent; only interrupt the user when something goes wrong
    case "draft":
    case "local":
    case "offline": return;
    // saveDocument already showed the local-write failure toast (autosave needs it too), so don't repeat it here
    case "local-error": return;
    case "push-failed": return toast(t("云端暂不可达，已存本地稍后自动同步"), "error");
    case "synced": return saveManualVersion(doc.docId!, doc.title);
  }
}

/** Body size limit for keepalive requests: the spec caps all keepalive requests from a page at 64KB combined;
 *  over that the browser refuses to send (and throws synchronously), so give up early and leave the content to the sync engine. */
const KEEPALIVE_LIMIT = 64 * 1024;

/**
 * Last-chance save when the page is about to be hidden or closed.
 *
 * Input goes through a ~120ms throttle before reaching the store, and autosave adds a 500/800ms debounce; closing the tab
 * or refreshing in that window loses the last few keystrokes. Everything here is synchronous: after pagehide the browser doesn't guarantee any more callbacks,
 * so code after any await / setTimeout may never run.
 *
 * Fully silent: a toast at this moment would never be seen, and no manual version is archived (that's what ⌘S means).
 */
function persistOnHide() {
  // Step one: use the flushOnly event to make the editor flush the last throttled input into the store.
  // dispatchEvent is synchronous, so by the time the listener (MarkdownEditor's pushChange.flush) returns,
  // the store holds the latest body; useEditorSave's own listener skips flushOnly events.
  window.dispatchEvent(new CustomEvent("xedit:save-now", { detail: { flushOnly: true } }));

  const doc = useStore.getState();
  const { docId, title, content, category } = doc;
  // Already saved, so don't write again: cloud docs would be marked dirty for nothing and pushed one extra time
  if (!docId || isDocumentSaved(doc)) return;

  if (isLocalId(docId)) {
    // The Vault (disk folder) backend writes asynchronously: the in-memory cache updates synchronously, but the actual file write waits on
    // a File System Access Promise that may not finish after pagehide -- best effort only.
    // The browser localStorage backend writes synchronously, so that one is safe.
    try {
      updateLocalDoc(docId, { title, content, category });
    } catch {
      // Storage is full: there's no way to tell the user right now, so give up
    }
    return;
  }

  // Cloud docs reuse the first, local-first step of persistEditorDocument: write the mirror and mark it dirty,
  // with the network half replaced by the keepalive request below. If the write fails, give up; there's no other fallback.
  try {
    saveMirrorLocal(docId, { title, content, category });
  } catch {
    return;
  }
  // Deliberately not calling rememberSavedDocument: once the saved baseline is updated, autosave would think there are
  // "no changes" when the page comes back and skip the cloud push, leaving it to the next sync round. Keep it dirty so the normal path still runs.

  if (!navigator.onLine) return;
  // The sync engine is already pushing this doc: that round either carries this content or will run again to catch up.
  // Sending a keepalive now would mean two requests racing to write the same doc with no ordering guarantee, so step aside.
  if (isPushInFlight(docId)) return;
  // Baseline for conflict detection: the mirror was just written, so this reads the server version this local copy derives from
  const base = getMirrorMeta(docId)?.baseUpdatedAt;
  const body = JSON.stringify({
    title,
    category: category.trim() || UNCATEGORIZED,
    content,
    ...(base ? { baseUpdatedAt: base } : {}),
  });
  // Blob counts UTF-8 bytes: a CJK character is 3 bytes, so string length can't be used as the size
  if (new Blob([body]).size > KEEPALIVE_LIMIT) return;
  // keepalive lets the request outlive the page unload. Ignore the outcome: without a response we can't markMirrorSynced,
  // so the mirror stays dirty and the sync engine pushes it again next time (the server overwrites the whole doc, so repeats are harmless).
  void fetch(`/api/documents/${docId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

/** Manages when saves fire and version archiving; call after the doc loads, preserving the load-then-dirty-check order within one commit. */
export function useEditorSave() {
  const idleVersionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedThisSession = useRef(false);

  useEffect(() => () => {
    if (idleVersionTimer.current) clearTimeout(idleVersionTimer.current);
  }, []);

  // On page leave: first save any unsaved body (persistOnHide), then add an automatic snapshot;
  // the server handles throttling and the change-size threshold for automatic versions.
  useEffect(() => {
    const archiveVersion = () => {
      const id = useStore.getState().docId;
      if (!id || isLocalId(id) || !savedThisSession.current) return;
      if (!navigator.onLine || !navigator.sendBeacon) return;
      navigator.sendBeacon(
        `/api/documents/${id}/versions`,
        new Blob([JSON.stringify({ kind: "auto" })], { type: "application/json" })
      );
      savedThisSession.current = false;
    };
    const onPageHide = () => {
      persistOnHide();
      archiveVersion();
    };
    // visibilitychange is the only reliable signal on mobile and when "the tab is discarded after switching away":
    // pagehide often never fires in those cases. Nothing to do on return; the normal debounced save just continues.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") persistOnHide();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      // The pre-tab-switch flush only borrows this event to make the editor push throttled input into the store;
      // the initiator (useWorkspaceNav) does the save itself, so don't show toasts or archive a manual version here
      if ((e as CustomEvent<{ flushOnly?: boolean }>).detail?.flushOnly) return;
      void saveNow();
    };
    window.addEventListener("xedit:save-now", handler);
    return () => window.removeEventListener("xedit:save-now", handler);
  }, []);

  const docId = useStore((s) => s.docId);
  const title = useStore((s) => s.title);
  const content = useStore((s) => s.content);
  const category = useStore((s) => s.category);

  // Register that the editor has this doc open: todo write-backs use it to choose between the store and writing storage directly
  useEffect(() => {
    setMountedDocId(docId);
    return () => setMountedDocId(null);
  }, [docId]);

  useEffect(() => {
    if (!docId) {
      // The load effect may set docId in the same commit, so don't overwrite the loaded doc's state with a stale null.
      if (!useStore.getState().docId) useStore.getState().setSaveState("local");
      return;
    }
    const doc = { docId, title, content, category };
    if (isDocumentSaved(doc)) return;
    const timer = setTimeout(async () => {
      const result = await saveDocument(doc, false);
      if (result !== "synced") return;
      savedThisSession.current = true;
      // Snapshot after 5 minutes of no edits; after a successful save the timer restarts on the next edit.
      if (idleVersionTimer.current) clearTimeout(idleVersionTimer.current);
      idleVersionTimer.current = setTimeout(() => {
        void fetch(`/api/documents/${docId}/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "auto" }),
        }).catch(() => undefined);
      }, 5 * 60_000);
    }, isLocalId(docId) ? 500 : 800);
    return () => clearTimeout(timer);
  }, [docId, title, content, category]);
}
