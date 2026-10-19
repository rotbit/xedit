"use client";

import { useEffect, useMemo, useRef } from "react";
import { pruneIndex } from "@/lib/docIndex";
import { searchDocIds } from "@/lib/docSearch";
import { pruneTodoCache } from "@/lib/todos/collect";
import { ALL, UNCATEGORIZED } from "../constants";
import { nameOf, parentOf } from "../lib/catPath";
import { buildTree, findNode } from "../lib/catTree";
import { pruneOpens, recencyOf, useRecentOpens } from "../lib/recentOpens";
import { catKey, docKey, reorderList } from "../lib/sidebarOrder";
import type { CatNode, DocMeta, DragItem } from "../types";
import { useAppConfig } from "./useAppConfig";
import { useAuthMode } from "./useAuthMode";
import { useCategoryActions } from "./useCategoryActions";
import { useDialogs } from "./useDialogs";
import { useDocActions } from "./useDocActions";
import { useDocLibrary } from "./useDocLibrary";
import { useDragMove } from "./useDragMove";
import { useImportDocs } from "./useImportDocs";
import { useMenus } from "./useMenus";
import { useSidebarPrefs } from "./useSidebarPrefs";
import { useVaultBoot } from "./useVaultBoot";
import { useVaultWatch } from "./useVaultWatch";
import { useWorkspaceNav } from "./useWorkspaceNav";

/**
 * All workspace state and actions, split by responsibility into several hooks and assembled here.
 * View components all receive this one object, avoiding a dozen levels of prop drilling.
 */
export function useWorkspace() {
  const auth = useAuthMode();
  const config = useAppConfig();
  const prefs = useSidebarPrefs();
  const menus = useMenus();
  const dialogs = useDialogs();
  const nav = useWorkspaceNav({ prefs, closeDocMenu: menus.closeDocMenu });
  const vault = useVaultBoot({ localMode: auth.localMode, nav });
  // With a disk library open, watch for external changes: reconcile with the disk when returning to the foreground
  useVaultWatch({ enabled: auth.localMode && vault.status === "open", nav });
  const library = useDocLibrary({
    loggedIn: auth.loggedIn,
    offlineAuthed: auth.offlineAuthed,
    localMode: auth.localMode,
    activeCat: nav.activeCat,
  });
  const docActions = useDocActions({ auth, library, nav });
  const catActions = useCategoryActions({ auth, library, nav });
  const importer = useImportDocs({ auth, library, nav });

  // The reorder callback runs at drop time and reads the current render's tree via ref (the drag hook is built before the tree)
  const treeRef = useRef<CatNode[]>([]);

  /** Insert the dragged item before/after targetKey in host's parent sequence:
   *  record the display order first (applies immediately), then move it along when crossing parents/categories.
   *  Subcategories and docs under host share one sequence and can be freely interleaved */
  const reorderItem = (
    item: DragItem,
    host: string,
    targetKey: string,
    zone: "before" | "after"
  ) => {
    const dragged = item.kind === "doc" ? (library.docs ?? []).find((d) => d.id === item.id) : null;
    if (item.kind === "doc") {
      if (!dragged) return;
      if (host === "") return; // No docs at the top level
    }
    const keys =
      host === ""
        ? treeRef.current.map((c) => catKey(c.name))
        : (findNode(treeRef.current, host)?.items ?? []).map((it) =>
            it.kind === "cat" ? catKey(it.node.name) : docKey(it.doc.id)
          );
    const movedKey = item.kind === "cat" ? catKey(nameOf(item.path)) : docKey(item.id);
    if (!keys.includes(movedKey)) keys.push(movedKey); // Moving in across parents/categories
    const list = reorderList(keys, movedKey, targetKey, zone);
    library.updateOrder((o) => ({ ...o, items: { ...o.items, [host]: list } }));
    if (item.kind === "cat") {
      if (parentOf(item.path) !== host) void catActions.moveCategory(item.path, host);
    } else if (dragged && (dragged.category || UNCATEGORIZED) !== host) {
      void docActions.moveDoc(dragged, host);
    }
  };

  const drag = useDragMove({
    docs: library.docs,
    customCats: library.customCats,
    expanded: prefs.expanded,
    expandOne: prefs.expandOne,
    moveDoc: docActions.moveDoc,
    moveCategory: catActions.moveCategory,
    reorderItem,
  });

  const { docs, customCats, trashDocs, order } = library;
  const { activeCat, isTrash, search } = nav;

  const tree = useMemo(
    () => buildTree(docs ?? [], customCats, order),
    [docs, customCats, order]
  );
  // The reorder callback only runs in drag-and-drop events (necessarily after this render's effect), so syncing the ref in the effect is fresh enough
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  const totalChars = useMemo(
    () => (docs ?? []).reduce((s, d) => s + (d.chars ?? 0), 0),
    [docs]
  );

  // Whenever the library changes, evict docs no longer in it from the docIndex cache: the cache lives on by id,
  // and without evicting it would keep bodies of deleted docs, or from before a logout/library switch, in memory forever
  // Same for the todo cache (shared by the sidebar "Today" count and the Today page)
  // Use the full allDocs: the visible list lacks the todo-list doc, and evicting by it would clear the list's cache every time and reread its body
  const { allDocs } = library;
  useEffect(() => {
    const ids = (allDocs ?? []).map((doc) => doc.id);
    pruneIndex(ids);
    pruneTodoCache(ids);
    // Open records live in localStorage across sessions: while the library hasn't loaded (null), ids is empty,
    // and evicting then would wipe all records on every reload, so wait until loaded and evict against the real list
    if (allDocs) pruneOpens(ids);
  }, [allDocs]);

  /**
   * Hit set for sidebar search: searches bodies as well as titles (bodies are in localStorage, computed purely client-side).
   * This only needs "which docs matched", so it uses searchDocIds — snippets and highlight ranges are only for list display,
   * and the sidebar would throw them away. The result is memoized as a whole: later re-renders with the same query reuse it,
   * recomputing only when the query or doc list changes.
   * The trash is different: deleted docs' bodies were cleared along with them, so it still matches by title/excerpt.
   */
  const searchHitIds = useMemo(() => {
    if (isTrash || !search.trim()) return null;
    return searchDocIds(docs ?? [], search);
  }, [docs, search, isTrash]);

  // The "Recently opened" view sorts by max(opened, edited); folders / search / trash still sort by updatedAt
  const opens = useRecentOpens();
  const byRecentOpen = !isTrash && activeCat === ALL && !search.trim();
  /** The time each doc should display / group by in the current view; view components all read it from here */
  const timeOf = useMemo(
    () => (byRecentOpen ? (d: DocMeta) => recencyOf(d, opens) : (d: DocMeta) => d.updatedAt),
    [byRecentOpen, opens]
  );

  /** Docs to show in the current view: filtered by category (including subcategories), then by search query */
  const filtered = useMemo(() => {
    const source = isTrash ? trashDocs : docs;
    const list = (source ?? []).filter((d) => {
      const cat = d.category || UNCATEGORIZED;
      if (!isTrash && activeCat !== ALL && cat !== activeCat && !cat.startsWith(`${activeCat}/`))
        return false;
      if (search.trim()) {
        if (searchHitIds) return searchHitIds.has(d.id);
        const q = search.trim().toLowerCase();
        return d.title.toLowerCase().includes(q) || (d.excerpt ?? "").toLowerCase().includes(q);
      }
      return true;
    });
    if (!byRecentOpen) return list;
    // filter already returns a new array, so sorting in place doesn't affect the source; Array.prototype.sort is stable, keeping equal items in order
    const at = new Map(list.map((d) => [d.id, Date.parse(recencyOf(d, opens)) || 0]));
    return list.sort((a, b) => at.get(b.id)! - at.get(a.id)!);
  }, [docs, trashDocs, isTrash, activeCat, search, searchHitIds, byRecentOpen, opens]);

  return {
    auth,
    config,
    prefs,
    menus,
    dialogs,
    nav,
    vault,
    library,
    docActions,
    catActions,
    importer,
    drag,
    tree,
    filtered,
    timeOf,
    totalChars,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
