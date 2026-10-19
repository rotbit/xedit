"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isDocumentSaved, persistEditorDocument } from "@/lib/editor/persistence";
import { useStore } from "@/store/useStore";
import { ALL, ASSETS, TODAY, TRASH, isVirtualCat } from "../constants";
import { markOpened } from "../lib/recentOpens";
import { removeLocal } from "../lib/storage";
import type { SidebarPrefs } from "./useSidebarPrefs";

/** Local memory left over from the multi-tab era; clear it on sight so it doesn't keep occupying localStorage */
const K_LEGACY_TABS = "xedit:open-tabs";

/**
 * Save before switching away from the current doc. The editor's input callback is throttled at ~120ms and autosave debounced at 800ms,
 * so switching docId directly would let the new doc's load overwrite those two windows of unsaved edits (useEditorDoc has no flush).
 * First dispatch an event so the editor synchronously flushes the pending change into the store, then write to disk here — since saving starts here,
 * the event carries a flushOnly flag so useEditorSave doesn't run a manual save again (toast + version archive).
 */
function flushEditorBeforeSwitch(nextId: string | null) {
  if (typeof window === "undefined") return;
  const before = useStore.getState();
  if (!before.docId || before.docId === nextId) return;
  window.dispatchEvent(new CustomEvent("xedit:save-now", { detail: { flushOnly: true } }));
  const doc = useStore.getState();
  // With no unsaved changes, don't rewrite the mirror for nothing (it would mark it dirty and push to the cloud once more)
  if (doc.docId !== before.docId || isDocumentSaved(doc)) return;
  // The status line belongs to the new doc now, so don't touch saveState here; push failures are still covered by mirror dirty + the sync engine
  void persistEditorDocument(doc, () => {});
}

interface Params {
  prefs: SidebarPrefs;
  /** Opening a doc also closes any doc menu that might still be open */
  closeDocMenu: () => void;
}

/**
 * Workspace navigation: current category / doc being read / search query.
 * Only one doc is open at a time; readingId null means we're on the list view.
 * The editor returns with ?doc=<id>, landing directly on that doc's reading view.
 */
export function useWorkspaceNav({ prefs, closeDocMenu }: Params) {
  const searchParams = useSearchParams();
  // Home = Today page (todos + recent writing); the ALL view still exists, reached from Today's "All" or a command
  const [activeCat, setActiveCat] = useState<string>(TODAY);
  const [search, setSearch] = useState("");
  // Which doc is open isn't persisted: returning to the list after a reload is intentional, so the last doc doesn't block you every time
  const [readingId, setReading] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("doc");
  });

  // window.location has timing races under client navigation, so read from useSearchParams;
  // adjust state during render with a guard (React's recommended pattern), and clean up the URL in an effect
  const urlDoc = searchParams.get("doc");
  const [consumedUrlDoc, setConsumedUrlDoc] = useState<string | null>(null);
  if (urlDoc && urlDoc !== consumedUrlDoc) {
    setConsumedUrlDoc(urlDoc);
    setReading(urlDoc);
  }
  useEffect(() => {
    if (urlDoc) window.history.replaceState(null, "", "/");
  }, [urlDoc]);

  // Record "Recently opened": sidebar clicks, ?doc= deep links and editor route redirects all end up at readingId, so recording here covers them all
  useEffect(() => {
    if (readingId) markOpened(readingId);
  }, [readingId]);

  // The tab bar is gone; clear the memory older versions left locally, once
  useEffect(() => {
    removeLocal(K_LEGACY_TABS);
  }, []);

  /** Global sidebar search: typing while in reading/image library/Today view switches back to the doc list first (those views don't show search results) */
  const onSearch = (v: string) => {
    setSearch(v);
    if (!v) return;
    setReading(null);
    if (activeCat === ASSETS || activeCat === TODAY) setActiveCat(ALL);
  };

  const openCategory = (path: string) => {
    setActiveCat(path);
    setReading(null);
    setSearch("");
    prefs.closeDrawerOnMobile();
    if (!isVirtualCat(path)) prefs.expandPath(path);
  };

  const openDoc = (id: string) => {
    // The trash view can't render the reader; switch back to a regular view before opening
    if (activeCat === TRASH) setActiveCat(ALL);
    flushEditorBeforeSwitch(id);
    setReading(id);
    closeDocMenu();
    prefs.closeDrawerOnMobile();
  };

  /** Open a doc; null = back to list view */
  const setReadingId = (id: string | null) => {
    // No flush when returning to the list: deleting a doc goes through this path too, and writing the deleted doc back to the mirror would "revive" it
    if (id === null) setReading(null);
    else openDoc(id);
  };

  return {
    activeCat,
    setActiveCat,
    readingId,
    setReadingId,
    search,
    onSearch,
    isTrash: activeCat === TRASH,
    openCategory,
    openDoc,
  };
}

export type WorkspaceNav = ReturnType<typeof useWorkspaceNav>;
