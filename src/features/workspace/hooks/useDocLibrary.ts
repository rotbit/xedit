"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore, DEFAULT_MARKDOWN } from "@/store/useStore";
import {
  queueSettingsWrite,
  useCloudSettings,
  type UserSettingsRow,
} from "@/hooks/useSettings";
import { listLocalDocs, listLocalCats, DOCS_CHANGED_EVENT } from "@/lib/localDocs";
import { getBrowserBackend, LOCAL_BACKEND_CHANGED_EVENT } from "@/lib/localBackend";
import { getActiveVault } from "@/lib/localBackend/vaultSession";
import { listMirrorDocs } from "@/lib/docStore";
import { startSync, syncNow, SYNC_DONE_EVENT } from "@/lib/sync";
import { startDayLogSync } from "@/lib/todos/dayLogSync";
import { findNotesDoc } from "@/lib/todos/collect";
import { toast } from "@/components/Toast";
import { t } from "@/i18n/t";
import { TRASH } from "../constants";
import { mergedCloudList } from "../lib/docSource";
import {
  parseSidebarOrder,
  readLocalOrder,
  writeLocalOrder,
  type SidebarOrder,
} from "../lib/sidebarOrder";
import type { DocMeta } from "../types";

interface Params {
  loggedIn: boolean;
  offlineAuthed: boolean;
  localMode: boolean;
  activeCat: string;
}

/** Where the ordering is stored depends on the backend: for a Vault it travels with the folder (follows you across devices);
 *  browser storage still uses localStorage */
function readActiveOrder(): SidebarOrder {
  const vault = getActiveVault();
  return vault ? parseSidebarOrder(vault.loadOrder()) : readLocalOrder();
}

/** Whether two lists match on the fields visible in the sidebar (order-sensitive; the lists are already sorted) */
function sameDocList(a: DocMeta[], b: DocMeta[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((d, i) => {
    const e = b[i];
    return (
      d.id === e.id &&
      d.title === e.title &&
      d.category === e.category &&
      d.updatedAt === e.updatedAt
    );
  });
}

/**
 * Remove the todo-list doc: it's just the storage vehicle for standalone todos on the Today page (riding on doc sync, cross-device for free),
 * an implementation detail that shouldn't show up in the category tree, doc counts, search or recent lists.
 * findNotesDoc caches parse results by updatedAt (sidebar counts walk the same batch every time anyway), so no extra cost of reading bodies here.
 * Without a todo-list doc, return the same reference unchanged so a needless new reference doesn't bust downstream useMemos.
 */
function hideNotesDoc(list: DocMeta[]): DocMeta[] {
  const notes = findNotesDoc(list);
  return notes ? list.filter((d) => d !== notes) : list;
}

/**
 * Loads the doc library and categories. Fully local-first: when logged in the list comes instantly from the local mirror
 * (+ local docs pending upload) and is refreshed after each sync engine round.
 */
export function useDocLibrary({ loggedIn, offlineAuthed, localMode, activeCat }: Params) {
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [customCats, setCustomCats] = useState<string[]>([]);
  const [trashDocs, setTrashDocs] = useState<DocMeta[] | null>(null);
  // Manual sidebar ordering: shown instantly from local cache, overwritten by the server after login
  const [order, setOrder] = useState<SidebarOrder>(readActiveOrder);
  const migratedRef = useRef(false);

  // The updater may only compute the new value: StrictMode runs it twice, so writing to disk / PUT inside would happen twice.
  // Side effects move outside, and the new value advances through this ref (so back-to-back calls in the same tick build on the latest)
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  /** Update ordering: applies and caches locally right away; when logged in, pushed to the server via a debounced channel (failures stay quiet and ride along with the next change) */
  const updateOrder = (mutate: (prev: SidebarOrder) => SidebarOrder) => {
    const next = mutate(orderRef.current);
    orderRef.current = next;
    setOrder(next);
    const vault = localMode ? getActiveVault() : null;
    if (vault) vault.saveOrder(next);
    else writeLocalOrder(next);
    // Consecutive drag reorders call this several times in a row; the channel merges them into one PUT
    if (loggedIn) queueSettingsWrite({ sidebarOrder: next });
  };

  // Local mode: docs and categories are read from the local library; loaded during render with a guard (React's recommended pattern)
  const [localLoaded, setLocalLoaded] = useState(false);
  if (localMode && !localLoaded) {
    setLocalLoaded(true);
    setDocs(listLocalDocs());
    setCustomCats(listLocalCats());
  }

  // When logged in the list likewise comes instantly from the local mirror during render, with a guard
  const [cloudLoaded, setCloudLoaded] = useState(false);
  if ((loggedIn || offlineAuthed) && !cloudLoaded) {
    setCloudLoaded(true);
    setDocs(mergedCloudList());
  }

  // Refresh the list as soon as anything is written locally (editor title/body changes, category moves),
  // without waiting for a full sync engine round — sidebar file names should follow edits live
  useEffect(() => {
    const refresh = () => {
      const next = localMode
        ? listLocalDocs()
        : loggedIn || offlineAuthed
          ? mergedCloudList()
          : null;
      // Reuse the old reference if nothing changed: DOCS_CHANGED fires more often than real changes,
      // and swapping in a new array would bust every useMemo in the sidebar tree/filters and re-render the whole tree
      if (next) setDocs((prev) => (prev && sameDocList(prev, next) ? prev : next));
    };
    window.addEventListener(DOCS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DOCS_CHANGED_EVENT, refresh);
  }, [loggedIn, offlineAuthed, localMode]);

  // The local backend was swapped (Vault opened/closed): docs, categories and ordering all belong to another library, so reread everything
  useEffect(() => {
    if (!localMode) return;
    const reload = () => {
      setDocs(listLocalDocs());
      setCustomCats(listLocalCats());
      setOrder(readActiveOrder());
    };
    window.addEventListener(LOCAL_BACKEND_CHANGED_EVENT, reload);
    return () => window.removeEventListener(LOCAL_BACKEND_CHANGED_EVENT, reload);
  }, [localMode]);

  // Custom categories (empty ones allowed) and sidebar ordering. Shares the single GET in useSettings with typography prefs,
  // so the first screen doesn't send two requests for the same settings
  const applySettings = useCallback((st: UserSettingsRow) => {
    try {
      const list = JSON.parse(st.categories ?? "[]");
      if (Array.isArray(list)) {
        setCustomCats(list.filter((c: unknown): c is string => typeof c === "string"));
      }
    } catch {
      // Ignore bad data
    }
    // Server ordering overrides the local cache (consistent across devices); if the server has none yet, keep the local one
    if (st.sidebarOrder && st.sidebarOrder !== "{}") {
      const remote = parseSidebarOrder(st.sidebarOrder);
      setOrder(remote);
      writeLocalOrder(remote);
    }
  }, []);
  useCloudSettings(loggedIn, applySettings);

  // Sync engine: refresh the list after each round; if the cloud is empty and the editor holds a draft written while logged out, move it to the cloud
  // (the welcome doc is created once by the server at account creation and isn't added here: returning users who deleted everything shouldn't get one more on every login)
  useEffect(() => {
    // The local account snapshot is written by useAuthMode (it runs earlier, and clearing the library on account switch is done there too)
    if (!loggedIn && !offlineAuthed) return;
    const refresh = () => {
      setDocs(mergedCloudList());
      if (
        loggedIn &&
        !migratedRef.current &&
        listMirrorDocs().length === 0 &&
        // Only look at the browser backend: files in a Vault don't mean they should be moved to the cloud
        getBrowserBackend().listDocs().length === 0
      ) {
        migratedRef.current = true;
        const s = useStore.getState();
        const hasLocalWork =
          s.docId === null && s.content.trim() && s.content !== DEFAULT_MARKDOWN;
        if (!hasLocalWork) return;
        void fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: s.title, content: s.content }),
        })
          .then((res) => {
            if (res.ok) {
              toast(t("本地文稿已同步到云端"), "success");
              void syncNow();
            }
          })
          .catch(() => undefined);
      }
    };
    window.addEventListener(SYNC_DONE_EVENT, refresh);
    // Attach the log sync listener first: startSync's first syncNow already pushes and pulls the daily log
    const stopDayLog = startDayLogSync();
    const stop = startSync();
    return () => {
      window.removeEventListener(SYNC_DONE_EVENT, refresh);
      stop();
      stopDayLog();
    };
  }, [loggedIn, offlineAuthed]);

  // Trash list (fetched on entering the trash): local mode reads the Vault's .trash/, logged-in mode asks the server
  useEffect(() => {
    if (activeCat !== TRASH || !localMode) return;
    const refresh = () => {
      const vault = getActiveVault();
      // Browser storage has no trash (delete means delete); the list stays empty and DocListStates shows the empty copy
      setTrashDocs(vault ? vault.listTrash() : []);
    };
    // Can't setState synchronously in an effect (react-hooks/set-state-in-effect), so defer to a microtask
    queueMicrotask(refresh);
    window.addEventListener(DOCS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DOCS_CHANGED_EVENT, refresh);
  }, [activeCat, localMode]);

  useEffect(() => {
    if (activeCat !== TRASH || !loggedIn) return;
    let cancelled = false;
    void fetch("/api/documents?trash=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (!cancelled) setTrashDocs(list);
      })
      .catch(() => {
        if (!cancelled) setTrashDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCat, loggedIn]);

  const visibleDocs = useMemo(() => docs && hideNotesDoc(docs), [docs]);

  return {
    /** User-visible docs: excluding the todo-list doc. Used everywhere for the sidebar, counts, search and lists */
    docs: visibleDocs,
    /** The whole library (including the todo-list doc): for places that need everything, like todo aggregation / write-back, import dedupe and cache cleanup */
    allDocs: docs,
    setDocs,
    customCats,
    setCustomCats,
    trashDocs,
    setTrashDocs,
    order,
    updateOrder,
  };
}

export type DocLibrary = ReturnType<typeof useDocLibrary>;
