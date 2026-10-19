"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/Toast";
import { t } from "@/i18n/t";
import { hasPendingContent, rememberSavedDocument } from "@/lib/editor/persistence";
import {
  getLocalDocContent,
  listLocalDocs,
  notifyDocReplaced,
  notifyDocsChanged,
} from "@/lib/localDocs";
import { forgetMissingAttachments } from "@/lib/localBackend/attachmentUrls";
import { rescanVault } from "@/lib/localBackend/vaultSession";
import { useStore } from "@/store/useStore";
import { UNCATEGORIZED } from "../constants";
import type { WorkspaceNav } from "./useWorkspaceNav";

/** Debounce for reconciling on return to foreground: switching tabs or clicking the window fires several events in a row; merge them into one */
const DEBOUNCE_MS = 1000;

/**
 * Detect external changes to a disk library: files edited in Obsidian / Finder should show their new content when you return to xedit.
 * The File System Access API has no change notifications, so we can only reconcile with the disk when returning to the foreground
 * (rescan is already reentrancy-safe; this adds a debounce on top to scan less).
 */
export function useVaultWatch({ enabled, nav }: { enabled: boolean; nav: WorkspaceNav }) {
  // Reconciling runs in event callbacks (necessarily after this render's effect), so syncing the ref in the effect is fresh enough
  const navRef = useRef(nav);
  useEffect(() => {
    navRef.current = nav;
  }, [nav]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let disposed = false;

    const run = async () => {
      if (running) return; // The previous round isn't done: what it scans is already the latest disk state
      running = true;
      try {
        const result = await rescanVault();
        if (disposed || !result) return;
        forgetMissingAttachments();
        const { changed, removed } = result;
        if (changed.length || removed.length || result.added.length) notifyDocsChanged();
        const openId = useStore.getState().docId;
        if (!openId) return;
        if (removed.includes(openId)) {
          navRef.current.setReadingId(null);
          toast(t("文件已在外部删除"), "error");
          return;
        }
        if (changed.includes(openId)) applyExternalChange(openId);
      } finally {
        running = false;
      }
    };

    const schedule = () => {
      if (timer) return; // Already queued: multiple events merge into this one
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, DEBOUNCE_MS);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", schedule);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", schedule);
    };
  }, [enabled]);
}

/**
 * The currently open doc changed on disk: with no unsaved changes, swap in the disk version; otherwise just notify and leave the user's edits alone.
 * Note rescan judges by mtime and may count our own just-saved writes as changed,
 * so compare content first — matching the store means it's such a false positive and nothing needs doing.
 */
function applyExternalChange(id: string) {
  const fresh = getLocalDocContent(id);
  if (fresh === null) return; // Gone again; leave it for the next reconcile
  const meta = listLocalDocs().find((d) => d.id === id);
  const s = useStore.getState();
  if (fresh === s.content) {
    if (meta && meta.title !== s.title) s.setTitle(meta.title); // Only the file name changed
    return;
  }
  if (hasPendingContent(id, s.content)) {
    toast(t("文件在外部被修改，已保留你当前的编辑"));
    return;
  }
  const title = meta?.title ?? s.title;
  const category = meta?.category ?? UNCATEGORIZED;
  rememberSavedDocument({ docId: id, title, content: fresh, category });
  s.setDoc({ id, title, content: fresh });
  s.setCategory(category);
  // The editor holds its own CodeMirror document, so updating the store alone won't refresh it; it needs a remount
  notifyDocReplaced(id);
}
