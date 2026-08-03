"use client";

import { createPortal } from "react-dom";
import { FilePlus2, FolderInput, FolderPlus, PenLine, RotateCw, Trash2 } from "lucide-react";
import { askCategoryPick } from "@/components/CategoryPickDialog";
import {
  ALL,
  MAX_DEPTH,
  UNCATEGORIZED,
  menuDangerCls,
  menuItemCls,
  menuPanelCls,
} from "../constants";
import { allCategories, canNestCategory } from "../lib/catTree";
import type { Workspace } from "../hooks/useWorkspace";

/** 分类操作菜单（右键 / 「···」共用）：根节点、未分类、普通分类各按能力渲染条目 */
export function CategoryContextMenu({ ws }: { ws: Workspace }) {
  const { menus, docActions, catActions, library } = ws;
  const anchor = menus.catMenu;
  if (!anchor) return null;

  const { path } = anchor;
  const isRoot = path === ALL;
  const canManage = !isRoot && path !== UNCATEGORIZED;
  const canAddChild = canManage && path.split("/").length < MAX_DEPTH;

  const run = (fn: () => void) => () => {
    menus.closeCatMenu();
    fn();
  };

  /** 文件夹归属到另一个文件夹：选择器只列合法落点（防自嵌套/超长），支持移出到顶级 */
  const moveViaPicker = async () => {
    const all = allCategories(library.customCats, library.docs);
    const name = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
    const target = await askCategoryPick({
      title: `移动「${name}」到文件夹`,
      categories: all.filter((c) => canNestCategory(path, c, all)),
      topOption: path.includes("/") ? "顶级（移出所有文件夹）" : undefined,
    });
    if (target === null) return;
    void catActions.moveCategory(path, target);
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-30"
        onClick={menus.closeCatMenu}
        onWheel={menus.closeCatMenu}
      />
      <div className={`${menuPanelCls} w-44`} style={{ top: anchor.top, left: anchor.left }}>
        <button
          className={menuItemCls}
          onClick={run(() => void docActions.createDoc(isRoot ? UNCATEGORIZED : path))}
        >
          <FilePlus2 size={13} className="text-[var(--ink-faint)]" />
          新建文章
        </button>
        {isRoot ? (
          <button className={menuItemCls} onClick={run(() => void catActions.createCategory())}>
            <FolderPlus size={13} className="text-[var(--ink-faint)]" />
            新建分类
          </button>
        ) : canAddChild ? (
          <button className={menuItemCls} onClick={run(() => void catActions.createCategory(path))}>
            <FolderPlus size={13} className="text-[var(--ink-faint)]" />
            新建子分类
          </button>
        ) : null}
        {isRoot ? (
          <button className={menuItemCls} onClick={run(() => void docActions.refreshDocs())}>
            <RotateCw size={13} className="text-[var(--ink-faint)]" />
            刷新列表
          </button>
        ) : null}
        {canManage ? (
          <>
            <div className="my-1 border-t border-[var(--hairline)]" />
            <button className={menuItemCls} onClick={run(() => void moveViaPicker())}>
              <FolderInput size={13} className="text-[var(--ink-faint)]" />
              移动到文件夹…
            </button>
            <button
              className={menuItemCls}
              onClick={run(() => void catActions.renameCategory(path))}
            >
              <PenLine size={13} className="text-[var(--ink-faint)]" />
              重命名
            </button>
            <button
              className={menuDangerCls}
              onClick={run(() => void catActions.removeCategory(path))}
            >
              <Trash2 size={13} />
              删除分类
            </button>
          </>
        ) : null}
      </div>
    </>,
    document.body
  );
}
