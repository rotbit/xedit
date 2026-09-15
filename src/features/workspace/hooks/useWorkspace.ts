"use client";

import { useEffect, useMemo, useRef } from "react";
import { pruneIndex } from "@/lib/docIndex";
import { searchDocs } from "@/lib/docSearch";
import { ALL, UNCATEGORIZED } from "../constants";
import { buildTree, findNode } from "../lib/catTree";
import { catKey, docKey, reorderList } from "../lib/sidebarOrder";
import type { CatNode, DragItem } from "../types";
import { useAppConfig } from "./useAppConfig";
import { useAuthMode } from "./useAuthMode";
import { useCategoryActions } from "./useCategoryActions";
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
 * 工作台的全部状态与操作，按职责拆成若干 hook 后在此汇总。
 * 各视图组件统一接收这个对象，避免十几层属性逐级透传。
 */
export function useWorkspace() {
  const auth = useAuthMode();
  const config = useAppConfig();
  const prefs = useSidebarPrefs();
  const menus = useMenus();
  const nav = useWorkspaceNav({ prefs, closeDocMenu: menus.closeDocMenu });
  const vault = useVaultBoot({ localMode: auth.localMode, nav });
  // 开着磁盘文库时盯外部改动：回到前台就跟磁盘对一次账
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

  // 排序回调在放下那一刻才执行，经 ref 读当次渲染的树（drag hook 先于 tree 构建）
  const treeRef = useRef<CatNode[]>([]);
  const parentOf = (path: string) =>
    path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const nameOf = (path: string) =>
    path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;

  /** 把拖拽项插到 host 父级序列里 targetKey 的前/后：
   *  先记显示顺序（立即生效），跨父级/跨分类再连带迁移。
   *  host 下的子分类与文章共用一条序列，两者可以自由混排 */
  const reorderItem = (
    item: DragItem,
    host: string,
    targetKey: string,
    zone: "before" | "after"
  ) => {
    const dragged = item.kind === "doc" ? (library.docs ?? []).find((d) => d.id === item.id) : null;
    if (item.kind === "doc") {
      if (!dragged) return;
      if (host === "") return; // 顶级没有文章
    }
    const keys =
      host === ""
        ? treeRef.current.map((c) => catKey(c.name))
        : (findNode(treeRef.current, host)?.items ?? []).map((it) =>
            it.kind === "cat" ? catKey(it.node.name) : docKey(it.doc.id)
          );
    const movedKey = item.kind === "cat" ? catKey(nameOf(item.path)) : docKey(item.id);
    if (!keys.includes(movedKey)) keys.push(movedKey); // 跨父级/跨分类迁入
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
  // 排序回调只在拖放事件里执行（必然晚于本次渲染的 effect），effect 里同步 ref 足够新鲜
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  const totalChars = useMemo(
    () => (docs ?? []).reduce((s, d) => s + (d.chars ?? 0), 0),
    [docs]
  );

  // 文库一变就把已不在库里的文章清出 docIndex 缓存：缓存按 id 长住，
  // 不清就会把删掉的、退出登录换库之后的正文一直攥在内存里
  useEffect(() => {
    pruneIndex((docs ?? []).map((doc) => doc.id));
  }, [docs]);

  /**
   * 侧栏搜索的命中集合：标题之外还搜正文（正文在 localStorage，纯客户端算）。
   * 全库扫一遍要逐篇读 localStorage，所以结果整体挂在 useMemo 上——
   * 同一个词的后续重渲染直接复用，只有词或文章列表变了才重算一轮。
   * 回收站另说：删掉的文章正文已随之清掉，仍按标题/摘要匹配。
   */
  const searchHitIds = useMemo(() => {
    if (isTrash || !search.trim()) return null;
    const list = docs ?? [];
    return new Set(searchDocs(list, search, { limit: list.length }).map((h) => h.doc.id));
  }, [docs, search, isTrash]);

  /** 当前视图下要展示的文章：按分类过滤（含子分类），再按搜索词过滤 */
  const filtered = useMemo(() => {
    const source = isTrash ? trashDocs : docs;
    return (source ?? []).filter((d) => {
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
  }, [docs, trashDocs, isTrash, activeCat, search, searchHitIds]);

  return {
    auth,
    config,
    prefs,
    menus,
    nav,
    vault,
    library,
    docActions,
    catActions,
    importer,
    drag,
    tree,
    filtered,
    totalChars,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
