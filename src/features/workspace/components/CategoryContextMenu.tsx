"use client";

/**
 * Category (folder) action menu; one instance shared by right-click and the 「···」 button.
 * Position and open state live in ws.menus.catMenu, only one is mounted globally, and nothing renders when anchor is null.
 * Portaled to body, otherwise the sidebar's overflow would clip it.
 */
import { useRef } from "react";
import { createPortal } from "react-dom";
import {
  BookDown,
  ChevronsDownUp,
  ChevronsUpDown,
  FileInput,
  FilePlus2,
  FolderInput,
  FolderOutput,
  FolderPlus,
  PanelRight,
  PenLine,
  RotateCw,
  Trash2,
} from "lucide-react";
import { askCategoryPick } from "@/components/CategoryPickDialog";
import { useEscape } from "@/hooks/useEscape";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useT } from "@/i18n/useT";
import {
  ALL,
  MAX_DEPTH,
  UNCATEGORIZED,
  menuDangerCls,
  menuItemCls,
  menuPanelCls,
} from "../constants";
import { nameOf } from "../lib/catPath";
import { allCategories, canNestCategory } from "../lib/catTree";
import type { Workspace } from "../hooks/useWorkspace";

/** Category action menu (shared by right-click / 「···」): root, uncategorized and regular categories each render items according to their capabilities */
export function CategoryContextMenu({ ws }: { ws: Workspace }) {
  const { menus, dialogs, docActions, catActions, library, auth, prefs, nav } = ws;
  const anchor = menus.catMenu;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const t = useT();
  useEscape(menus.closeCatMenu, anchor !== null);
  useDismissMenu(panelRef, menus.closeCatMenu, anchor !== null);
  if (!anchor) return null;

  const { path } = anchor;
  const isRoot = path === ALL;
  const canManage = !isRoot && path !== UNCATEGORIZED;
  // Category paths are joined with /, so the segment count is the depth; at MAX_DEPTH, drop 「新建子文件夹」 (New subfolder)
  const canAddChild = canManage && path.split("/").length < MAX_DEPTH;
  // 「收起 / 展开」 (Collapse / Expand) only for folders with contents: expanding an empty folder changes nothing, an option that does nothing when clicked
  const hasChildren =
    !isRoot &&
    (library.customCats.some((c) => c.startsWith(`${path}/`)) ||
      (library.docs ?? []).some((d) => d.category === path || d.category?.startsWith(`${path}/`)));
  const isOpen = prefs.expanded.has(path);

  // Every item closes the menu before running its action: actions may open inputs or pickers, and a lingering menu would sit on top
  const run = (fn: () => void) => () => {
    menus.closeCatMenu();
    fn();
  };

  /** Move a folder into another folder: the picker only lists valid targets (no self-nesting/over-depth) and supports moving out to the top level */
  const moveViaPicker = async () => {
    const all = allCategories(library.customCats, library.docs);
    const name = nameOf(path);
    const target = await askCategoryPick({
      title: t("移动「{name}」到文件夹", { name }),
      categories: all.filter((c) => canNestCategory(path, c, all)),
      // Folders already at the top level don't get 「移出」 (Move out), otherwise it's an option that does nothing
      topOption: path.includes("/") ? t("顶级（移出所有文件夹）") : undefined,
    });
    if (target === null) return;
    void catActions.moveCategory(path, target);
  };

  return createPortal(
    <div
      ref={panelRef}
      className={`${menuPanelCls} w-44`}
      style={{ top: anchor.top, left: anchor.left }}
    >
      <button
        className={menuItemCls}
        onClick={run(() => void docActions.createDoc(isRoot ? UNCATEGORIZED : path))}
      >
        <FilePlus2 size={14} className="text-[var(--ink-faint)]" />
        {t("新建文章")}
      </button>
      {isRoot ? (
        <button className={menuItemCls} onClick={run(() => void catActions.createCategory())}>
          <FolderPlus size={14} className="text-[var(--ink-faint)]" />
          {t("新建文件夹")}
        </button>
      ) : canAddChild ? (
        <button className={menuItemCls} onClick={run(() => void catActions.createCategory(path))}>
          <FolderPlus size={14} className="text-[var(--ink-faint)]" />
          {t("新建子文件夹")}
        </button>
      ) : null}
      {isRoot ? (
        <button className={menuItemCls} onClick={run(() => void docActions.refreshDocs())}>
          <RotateCw size={14} className="text-[var(--ink-faint)]" />
          {t("刷新列表")}
        </button>
      ) : null}

      {/* Clicking a folder name only expands it in the sidebar; to see this folder's timeline / list on the right, go through here */}
      {!isRoot ? (
        <button className={menuItemCls} onClick={run(() => nav.openCategory(path))}>
          <PanelRight size={14} className="text-[var(--ink-faint)]" />
          {t("在右侧打开")}
        </button>
      ) : null}
      {hasChildren ? (
        <button className={menuItemCls} onClick={run(() => prefs.toggleExpand(path))}>
          {isOpen ? (
            <ChevronsDownUp size={14} className="text-[var(--ink-faint)]" />
          ) : (
            <ChevronsUpDown size={14} className="text-[var(--ink-faint)]" />
          )}
          {isOpen ? t("收起") : t("展开")}
        </button>
      ) : null}

      <div className="my-1 border-t border-[var(--hairline)]" />
      {/* Imports land in this right-clicked folder; at root level none is specified, so the default "current category" logic applies */}
      <button
        className={menuItemCls}
        onClick={run(() => dialogs.openImport("file", isRoot ? undefined : path))}
      >
        <FileInput size={14} className="text-[var(--ink-faint)]" />
        {t("导入文件")}
      </button>
      <button
        className={menuItemCls}
        onClick={run(() => dialogs.openImport("folder", isRoot ? undefined : path))}
      >
        <FolderInput size={14} className="text-[var(--ink-faint)]" />
        {t("导入文件夹")}
      </button>
      {/* Feishu import pulls a whole library and its destination is set by the mirror prefix, so it's only on the root; it runs server-side, so it's unavailable when logged out */}
      {isRoot && auth.loggedIn ? (
        <button className={menuItemCls} onClick={run(dialogs.openFeishu)}>
          <BookDown size={14} className="text-[var(--ink-faint)]" />
          {t("飞书知识库导入")}
        </button>
      ) : null}

      {canManage ? (
        <>
          <div className="my-1 border-t border-[var(--hairline)]" />
          {/* Icon uses "move out" rather than FolderInput: in this same menu FolderInput already means 「导入文件夹」 (Import folder) */}
          <button className={menuItemCls} onClick={run(() => void moveViaPicker())}>
            <FolderOutput size={14} className="text-[var(--ink-faint)]" />
            {t("移动到文件夹")}
          </button>
          <button className={menuItemCls} onClick={run(() => void catActions.renameCategory(path))}>
            <PenLine size={14} className="text-[var(--ink-faint)]" />
            {t("重命名")}
          </button>
          <button
            className={menuDangerCls}
            onClick={run(() => void catActions.removeCategory(path))}
          >
            <Trash2 size={14} />
            {t("删除文件夹")}
          </button>
        </>
      ) : null}
    </div>,
    document.body
  );
}
