"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useStore } from "@/store/useStore";
import { toast } from "@/components/Toast";
import { t } from "@/i18n/t";
import { UNCATEGORIZED } from "@/lib/docDefaults";
import {
  isLocalId,
  listLocalDocs,
  getLocalDocContent,
  DOC_REPLACED_EVENT,
} from "@/lib/localDocs";
import { prefetchAttachments } from "@/lib/localBackend/attachmentUrls";
import { wasAuthed } from "@/lib/authSnapshot";
import {
  getMirrorMeta,
  getMirrorContent,
  applyServerDoc,
  removeMirrorDoc,
  setMirrorCreatedAt,
} from "@/lib/docStore";
import { getSavedDocument, rememberSavedDocument, hasPendingContent } from "@/lib/editor/persistence";
import { useEditorSave } from "@/hooks/useEditorSave";
import { useEditorSettings } from "@/hooks/useEditorSettings";

/** Throttle for freshness checks on returning to foreground: switching tabs back and forth shouldn't keep hitting the API */
const REFRESH_MIN_INTERVAL = 3000;

/**
 * How long the freshness notice stays. Content being replaced by the cloud version is "something that happened along the way" and doesn't deserve a toast blocking the view;
 * the status line (the Saved / Synced to cloud slot) just briefly swaps to a notice and then reverts.
 * Must match the .sync-hint animation duration in globals.css so the fade-out lines up with the text switching back.
 */
const REFRESH_HINT_MS = 4000;

/**
 * Doc session entry point: handles loading and background freshness checks; saving and preference sync are managed by separate hooks.
 * routeDocId null means local draft mode (writing while logged out).
 */
export function useEditorDoc(routeDocId: string | null) {
  const { status } = useSession();
  const loggedIn = status === "authenticated";
  const router = useRouter();

  /** Marker for a finished doc load; the editor uses it as a key to rebuild */
  const [docVersion, setDocVersion] = useState(0);
  const [loading, setLoading] = useState(routeDocId !== null);
  const [reloadTick, setReloadTick] = useState(0);

  /** Docs that reused store content directly, to prevent reloading when the effect reruns and interrupting typing */
  const adoptedRef = useRef<string | null>(null);
  /** When we last checked freshness with the server, for throttling */
  const lastRefreshAtRef = useRef(0);

  /** Content was just replaced with the latest cloud version: the status line shows a notice that reverts after a few seconds */
  const [refreshedHint, setRefreshedHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showRefreshHint = useCallback(() => {
    setRefreshedHint(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setRefreshedHint(false), REFRESH_HINT_MS);
  }, []);
  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  /**
   * Refresh the current doc from the cloud: only replace when the mirror isn't dirty (no unpushed changes) and the store matches the mirror
   * (no unsaved edits); local always wins. Shared by three places: after load, on returning to foreground, and on network recovery.
   *
   * Sends the mirror timestamp as ?since=: if nothing changed the server returns 204 instead of re-downloading the whole body
   * (this path runs every time a doc is opened and every time the page returns to the foreground). On 200 the time comparison below is still kept as a fallback.
   */
  const refreshFromServer = useCallback(async (id: string) => {
    if (!id || isLocalId(id) || !navigator.onLine) return;
    const meta = getMirrorMeta(id);
    const mirrored = meta ? getMirrorContent(id) : null;
    if (!meta || mirrored === null || meta.dirty) return;
    const before = useStore.getState();
    if (before.docId !== id || before.content !== mirrored || before.title !== meta.title) return;
    lastRefreshAtRef.current = Date.now();
    try {
      // Old mirror lacks a creation time: skip ?since= this round, preferring one extra body download to get the full row and fill it in
      // (incremental sync only sends changed docs, so untouched old docs can't get it filled in elsewhere)
      const backfill = !meta.createdAt;
      const res = await fetch(
        backfill
          ? `/api/documents/${id}`
          : `/api/documents/${id}?since=${encodeURIComponent(meta.updatedAt)}`
      );
      if (res.status === 204) return; // Nothing newer in the cloud
      if (!res.ok) return;
      const doc = await res.json();
      // Fill in the creation time before deciding whether to replace content: when the cloud has nothing newer, we return right below
      if (backfill && typeof doc.createdAt === "string") setMirrorCreatedAt(id, doc.createdAt);
      if (new Date(doc.updatedAt).getTime() <= new Date(meta.updatedAt).getTime()) return;
      // The user may have started typing or switched away during the round trip; check again before writing back to the store
      const now = useStore.getState();
      if (now.docId !== id || now.content !== mirrored || now.title !== meta.title) return;
      applyServerDoc(doc);
      rememberSavedDocument({
        docId: doc.id,
        title: doc.title,
        content: doc.content,
        category: doc.category ?? UNCATEGORIZED,
      });
      now.setDoc({ id: doc.id, title: doc.title, content: doc.content });
      now.setCategory(doc.category ?? UNCATEGORIZED);
      now.setSaveState("saved");
      setDocVersion((v) => v + 1);
      showRefreshHint();
    } catch {
      // Network blips etc.: keep current content and retry on the next trigger
    }
  }, [showRefreshHint]);

  // —— Load the doc ——
  useEffect(() => {
    if (!routeDocId) {
      // Local draft mode: reuse the persisted local content
      const s = useStore.getState();
      s.setDoc({ id: null, title: s.title, content: s.content });
      s.setCategory(UNCATEGORIZED);
      s.setSaveState("local");
      return;
    }
    // When the effect reruns because session status settled etc., don't reload an already loaded doc (prevents interrupting typing)
    if (reloadTick === 0 && adoptedRef.current === routeDocId) return;
    // When switching between reading view ↔ editor page the store may hold debounced edits not yet saved; only then reuse the store
    // to avoid stale data overwriting them; the following autosave will flush the pending content.
    // Conversely (store matches saved content) it must not be reused — the mirror may have just been refreshed by background sync,
    // and reusing the old store would overwrite the new content; that's exactly where "go back to the workspace, click in again, still the old draft" came from.
    if (
      reloadTick === 0 &&
      useStore.getState().docId === routeDocId &&
      hasPendingContent(routeDocId, useStore.getState().content)
    ) {
      adoptedRef.current = routeDocId;
      queueMicrotask(() => {
        setDocVersion((v) => v + 1);
        setLoading(false);
      });
      return;
    }
    if (isLocalId(routeDocId)) {
      // Local doc: doesn't depend on session status, load straight from the local library;
      // the effect reruns when session status settles from loading, and the saved baseline prevents reloading and interrupting typing.
      // The saved baseline survives across mounts, so also confirm the store actually holds this doc, or a load would be missed.
      if (getSavedDocument().docId === routeDocId && useStore.getState().docId === routeDocId)
        return;
      const meta = listLocalDocs().find((d) => d.id === routeDocId);
      const content = getLocalDocContent(routeDocId);
      if (!meta || content === null) {
        toast(t("本地文章不存在"), "error");
        router.replace("/");
        return;
      }
      rememberSavedDocument({
        docId: routeDocId,
        title: meta.title,
        content,
        category: meta.category ?? UNCATEGORIZED,
      });
      const s = useStore.getState();
      s.setDoc({ id: routeDocId, title: meta.title, content });
      s.setCategory(meta.category ?? UNCATEGORIZED);
      s.setSaveState("local");
      prefetchAttachments(content); // Start reading disk-library images early to cut a few frames of blank images
      queueMicrotask(() => {
        setDocVersion((v) => v + 1);
        setLoading(false);
      });
      return;
    }
    // —— Cloud doc: mirror first ——
    // With a mirror, load immediately (instant, offline, no session needed), and check freshness in the background when online
    let cancelled = false;
    const mirrorMeta = reloadTick === 0 ? getMirrorMeta(routeDocId) : null;
    const mirrorContent = mirrorMeta ? getMirrorContent(routeDocId) : null;
    if (mirrorMeta && mirrorContent !== null) {
      adoptedRef.current = routeDocId;
      rememberSavedDocument({
        docId: routeDocId,
        title: mirrorMeta.title,
        content: mirrorContent,
        category: mirrorMeta.category ?? UNCATEGORIZED,
      });
      const s = useStore.getState();
      s.setDoc({ id: routeDocId, title: mirrorMeta.title, content: mirrorContent });
      s.setCategory(mirrorMeta.category ?? UNCATEGORIZED);
      s.setSaveState(mirrorMeta.dirty ? "pending" : "saved");
      queueMicrotask(() => {
        setDocVersion((v) => v + 1);
        setLoading(false);
      });
      // Background freshness check: only replace when the server is newer and there are no local changes (local-first).
      // Like the load above, move it out of the effect's synchronous body to avoid cascading renders right on load
      queueMicrotask(() => void refreshFromServer(routeDocId));
      return;
    }

    // No mirror: needs network and login (first open of this doc; also save a mirror for later offline use)
    if (status === "loading") return;
    if (status === "unauthenticated") {
      // unauthenticated doesn't necessarily mean logged out: next-auth reports it too when offline or the server is unreachable.
      // If this device remembers logging in, don't push the user to log in; say "this doc hasn't been cached" instead
      toast(
        wasAuthed()
          ? t("离线中，这篇文章还没有缓存到本地，联网后打开一次即可离线使用")
          : t("请先登录后再打开云端文章"),
        "error"
      );
      router.replace("/");
      return;
    }
    if (!navigator.onLine) {
      toast(t("此文章尚未离线缓存，联网后打开一次即可离线使用"), "error");
      router.replace("/");
      return;
    }

    void (async () => {
      const res = await fetch(`/api/documents/${routeDocId}`).catch(() => null);
      if (cancelled) return;
      if (!res || !res.ok) {
        toast(t("文章不存在或无权限"), "error");
        router.replace("/");
        return;
      }
      const doc = await res.json();
      if (cancelled) return;
      // Forced refetch cases like version rollback: clear the mirror's dirty flag before saving, so stale pending content doesn't overwrite the rollback
      removeMirrorDoc(doc.id);
      applyServerDoc(doc);
      adoptedRef.current = doc.id;
      rememberSavedDocument({
        docId: doc.id,
        title: doc.title,
        content: doc.content,
        category: doc.category ?? UNCATEGORIZED,
      });
      useStore.getState().setDoc({ id: doc.id, title: doc.title, content: doc.content });
      useStore.getState().setCategory(doc.category ?? UNCATEGORIZED);
      useStore.getState().setSaveState("saved");
      setDocVersion((v) => v + 1);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [routeDocId, status, router, reloadTick, refreshFromServer]);

  // —— Freshness check on returning to foreground / network recovery ——
  // There's no WebSocket push, so this is the only moment changes from MCP, other devices or another tab reach the current page.
  useEffect(() => {
    if (!routeDocId || isLocalId(routeDocId)) return;
    const tryRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL) return;
      void refreshFromServer(routeDocId);
    };
    document.addEventListener("visibilitychange", tryRefresh);
    window.addEventListener("online", tryRefresh);
    return () => {
      document.removeEventListener("visibilitychange", tryRefresh);
      window.removeEventListener("online", tryRefresh);
    };
  }, [routeDocId, refreshFromServer]);

  // The current doc was changed externally and useVaultWatch already swapped the content into the store: remount the editor to pick it up
  useEffect(() => {
    const onReplaced = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id !== useStore.getState().docId) return;
      prefetchAttachments(useStore.getState().content);
      setDocVersion((v) => v + 1);
    };
    window.addEventListener(DOC_REPLACED_EVENT, onReplaced);
    return () => window.removeEventListener(DOC_REPLACED_EVENT, onReplaced);
  }, []);

  useEditorSettings(loggedIn);
  useEditorSave();

  return {
    loggedIn,
    sessionStatus: status,
    docVersion,
    loading,
    /** New cloud content was just pulled; the status line briefly shows a notice based on this (instead of a popup) */
    refreshedHint,
    /** Refetch the current doc from the cloud (used after a version rollback) */
    reload: () => setReloadTick((t) => t + 1),
  };
}
