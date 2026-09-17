"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { BookUp, PenLine, TextCursorInput, Trash2, FolderInput, FolderPlus } from "lucide-react";
import { askCategoryPick } from "@/components/CategoryPickDialog";
import { useEscape } from "@/hooks/useEscape";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { UNCATEGORIZED, menuDangerCls, menuItemCls } from "../constants";
import { allCategories } from "../lib/catTree";
import type { Workspace } from "../hooks/useWorkspace";

/**
 * 文档操作菜单（卡片、列表行与侧栏文章行共用）。portal 到 body：卡片的
 * rise/hover transform 会劫持 fixed 定位的 containing block，导致菜单被裁剪。
 *
 * 整个工作台只挂一个（同 CategoryContextMenu），目标由 `menus.docMenu` 的锚点决定。
 * 原先每行各挂一个：N 行就有 N 份 Esc/外部点击监听随每次渲染装卸，而且同一篇文章
 * 若既在侧栏树里又在内容列表里，右键会同时渲染两个一模一样的菜单面板。
 * 回收站行不开这个菜单（没有右键与「⋯」），所以从 library.docs 里找就够。
 */
export function DocContextMenu({ ws }: { ws: Workspace }) {
  const { menus, nav, library, docActions, auth } = ws;
  const anchor = menus.docMenu;
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Esc 关菜单：和弹窗、斜杠菜单一致，别让用户去找空白处点
  useEscape(menus.closeDocMenu, anchor !== null);
  useDismissMenu(panelRef, menus.closeDocMenu, anchor !== null);
  const doc = anchor ? library.docs?.find((d) => d.id === anchor.id) : undefined;
  // 锚点在、文章却没了（另一个标签页删掉 / 列表刚刷新）：什么都不渲染
  if (!anchor || !doc) return null;
  const cat = doc.category || UNCATEGORIZED;

  const run = (fn: () => void) => () => {
    menus.closeDocMenu();
    fn();
  };

  /** 分类可能有几百个且层级很深，弹带搜索的选择器而不是在菜单里平铺 */
  const moveViaPicker = async () => {
    const target = await askCategoryPick({
      title: `移动「${doc.title || UNTITLED_DOC}」到分类`,
      categories: allCategories(library.customCats, library.docs),
      current: cat,
    });
    if (target && target !== cat) void docActions.moveDoc(doc, target);
  };

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-40 w-48 overflow-y-auto rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_10px_36px_rgba(0,0,0,0.16)]"
      style={{
        top: anchor.top,
        right: anchor.right,
        maxHeight: `calc(100vh - ${anchor.top + 12}px)`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className={menuItemCls} onClick={run(() => nav.openDoc(doc.id))}>
        <PenLine size={13} className="text-[var(--ink-faint)]" />
        编辑
      </button>
      <button className={menuItemCls} onClick={run(() => void docActions.renameDoc(doc))}>
        <TextCursorInput size={13} className="text-[var(--ink-faint)]" />
        重命名
      </button>
      <button className={menuItemCls} onClick={run(() => void moveViaPicker())}>
        <FolderInput size={13} className="text-[var(--ink-faint)]" />
        移动到分类
      </button>
      <button className={menuItemCls} onClick={run(() => void docActions.moveToNewCategory(doc))}>
        <FolderPlus size={13} className="text-[var(--ink-faint)]" />
        新建文件夹
      </button>
      {!auth.localMode ? (
        <>
          <div className="my-1 border-t border-[var(--hairline)]" />
          <button
            className={menuItemCls}
            onClick={run(() => void docActions.pushToFeishu(doc))}
            disabled={docActions.pushingFeishu}
          >
            <BookUp size={13} className="text-[var(--ink-faint)]" />
            推送到飞书
          </button>
        </>
      ) : null}
      <div className="my-1 border-t border-[var(--hairline)]" />
      <button className={menuDangerCls} onClick={run(() => void docActions.removeDoc(doc))}>
        <Trash2 size={13} />
        删除文章
      </button>
    </div>,
    document.body
  );
}
