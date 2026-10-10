"use client";

/**
 * 分类（文件夹）操作菜单，右键和「···」按钮共用这一个实例。
 * 位置与开关都存在 ws.menus.catMenu 里，全局只挂一份，anchor 为 null 时整个组件不渲染。
 * 用 portal 挂到 body，否则会被侧栏的 overflow 裁掉。
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

/** 分类操作菜单（右键 / 「···」共用）：根节点、未分类、普通分类各按能力渲染条目 */
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
  // 分类路径用 / 拼接，段数就是层级深度；到 MAX_DEPTH 就不再给「新建子文件夹」这一条
  const canAddChild = canManage && path.split("/").length < MAX_DEPTH;
  // 「收起 / 展开」只给里面有东西的文件夹：空文件夹展开了也没变化，是个点了什么都不会发生的选项
  const hasChildren =
    !isRoot &&
    (library.customCats.some((c) => c.startsWith(`${path}/`)) ||
      (library.docs ?? []).some((d) => d.category === path || d.category?.startsWith(`${path}/`)));
  const isOpen = prefs.expanded.has(path);

  // 每个条目都先关菜单再执行动作：动作里可能弹输入框或选择器，菜单留着会压在上面
  const run = (fn: () => void) => () => {
    menus.closeCatMenu();
    fn();
  };

  /** 文件夹归属到另一个文件夹：选择器只列合法落点（防自嵌套/超长），支持移出到顶级 */
  const moveViaPicker = async () => {
    const all = allCategories(library.customCats, library.docs);
    const name = nameOf(path);
    const target = await askCategoryPick({
      title: t("移动「{name}」到文件夹", { name }),
      categories: all.filter((c) => canNestCategory(path, c, all)),
      // 本来就在顶级的文件夹不给「移出」，否则是个点了什么都不会发生的选项
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

      {/* 点文件夹名只展开侧栏；想在右侧看这个文件夹的时间流 / 列表，从这里进 */}
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
      {/* 导入落到右键的这个文件夹；根级不指定，沿用「当前分类」的默认算法 */}
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
      {/* 飞书导入整库拉取、落点由镜像前缀决定，所以只挂在根级；它走服务端，未登录时给不出来 */}
      {isRoot && auth.loggedIn ? (
        <button className={menuItemCls} onClick={run(dialogs.openFeishu)}>
          <BookDown size={14} className="text-[var(--ink-faint)]" />
          {t("飞书知识库导入")}
        </button>
      ) : null}

      {canManage ? (
        <>
          <div className="my-1 border-t border-[var(--hairline)]" />
          {/* 图标用「移出」而非 FolderInput：同一个菜单里 FolderInput 已经是「导入文件夹」了 */}
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
