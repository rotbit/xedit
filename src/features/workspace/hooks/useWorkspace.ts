"use client";

import { useMemo } from "react";
import { ALL, UNCATEGORIZED } from "../constants";
import { buildTree } from "../lib/catTree";
import { useAppConfig } from "./useAppConfig";
import { useAuthMode } from "./useAuthMode";
import { useCategoryActions } from "./useCategoryActions";
import { useDocActions } from "./useDocActions";
import { useDocLibrary } from "./useDocLibrary";
import { useDragMove } from "./useDragMove";
import { useMenus } from "./useMenus";
import { useSidebarPrefs } from "./useSidebarPrefs";
import { useWorkspaceNav } from "./useWorkspaceNav";

/**
 * 工作台的全部状态与操作，按职责拆成若干 hook 后在此汇总。
 * 各视图组件统一接收这个对象，避免十几层属性逐级透传。
 */
export function useWorkspace() {
  const auth = useAuthMode();
  const config = useAppConfig();
  const prefs = useSidebarPrefs();
  const menus = useMenus();
  const nav = useWorkspaceNav({ prefs, closeDocMenu: menus.closeDocMenu });
  const library = useDocLibrary({
    loggedIn: auth.loggedIn,
    offlineAuthed: auth.offlineAuthed,
    localMode: auth.localMode,
    activeCat: nav.activeCat,
  });
  const docActions = useDocActions({ auth, library, nav });
  const catActions = useCategoryActions({ auth, library, nav });
  const drag = useDragMove({
    docs: library.docs,
    customCats: library.customCats,
    expanded: prefs.expanded,
    expandOne: prefs.expandOne,
    moveDoc: docActions.moveDoc,
    moveCategory: catActions.moveCategory,
  });

  const { docs, customCats, trashDocs } = library;
  const { activeCat, isTrash, search } = nav;

  const tree = useMemo(() => buildTree(docs ?? [], customCats), [docs, customCats]);

  const totalChars = useMemo(
    () => (docs ?? []).reduce((s, d) => s + (d.chars ?? 0), 0),
    [docs]
  );

  /** 当前视图下要展示的文章：按分类过滤（含子分类），再按搜索词过滤 */
  const filtered = useMemo(() => {
    const source = isTrash ? trashDocs : docs;
    return (source ?? []).filter((d) => {
      const cat = d.category || UNCATEGORIZED;
      if (!isTrash && activeCat !== ALL && cat !== activeCat && !cat.startsWith(`${activeCat}/`))
        return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return d.title.toLowerCase().includes(q) || (d.excerpt ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [docs, trashDocs, isTrash, activeCat, search]);

  return {
    auth,
    config,
    prefs,
    menus,
    nav,
    library,
    docActions,
    catActions,
    drag,
    tree,
    filtered,
    totalChars,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
