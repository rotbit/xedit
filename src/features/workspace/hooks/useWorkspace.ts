"use client";

import { useEffect, useMemo, useRef } from "react";
import { ALL, UNCATEGORIZED } from "../constants";
import { buildTree, findNode } from "../lib/catTree";
import { reorderList } from "../lib/sidebarOrder";
import type { CatNode } from "../types";
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

  // 排序回调在放下那一刻才执行，经 ref 读当次渲染的树（drag hook 先于 tree 构建）
  const treeRef = useRef<CatNode[]>([]);
  const parentOf = (path: string) =>
    path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const nameOf = (path: string) =>
    path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;

  /** 分类插到 targetPath 前/后：先记显示顺序（立即生效），跨父级再连带迁移 */
  const reorderCategory = (path: string, targetPath: string, zone: "before" | "after") => {
    const parent = parentOf(targetPath);
    const siblings = parent ? (findNode(treeRef.current, parent)?.children ?? []) : treeRef.current;
    const names = siblings.map((n) => n.name);
    const moved = nameOf(path);
    if (!names.includes(moved)) names.push(moved); // 跨父级迁入
    const list = reorderList(names, moved, nameOf(targetPath), zone);
    library.updateOrder((o) => ({ ...o, cats: { ...o.cats, [parent]: list } }));
    if (parentOf(path) !== parent) void catActions.moveCategory(path, parent);
  };

  /** 文章插到 targetId 前/后：记录该分类下的手动顺序，跨分类再连带移动 */
  const reorderDoc = (id: string, targetId: string, zone: "before" | "after") => {
    const all = library.docs ?? [];
    const dragged = all.find((d) => d.id === id);
    const target = all.find((d) => d.id === targetId);
    if (!dragged || !target) return;
    const cat = target.category || UNCATEGORIZED;
    const ids = (findNode(treeRef.current, cat)?.docs ?? []).map((d) => d.id);
    if (!ids.includes(id)) ids.push(id); // 跨分类迁入
    const list = reorderList(ids, id, targetId, zone);
    library.updateOrder((o) => ({ ...o, docs: { ...o.docs, [cat]: list } }));
    if ((dragged.category || UNCATEGORIZED) !== cat) void docActions.moveDoc(dragged, cat);
  };

  const drag = useDragMove({
    docs: library.docs,
    customCats: library.customCats,
    expanded: prefs.expanded,
    expandOne: prefs.expandOne,
    moveDoc: docActions.moveDoc,
    moveCategory: catActions.moveCategory,
    reorderCategory,
    reorderDoc,
  });

  const { docs, customCats, trashDocs, order } = library;
  const { activeCat, isTrash, search } = nav;

  const tree = useMemo(
    () => buildTree(docs ?? [], customCats, order),
    [docs, customCats, order]
  );
  // 排序回调只在拖放事件里执行（必然晚于本次渲染的 effect），effect 里同步 ref 足够新鲜
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

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
