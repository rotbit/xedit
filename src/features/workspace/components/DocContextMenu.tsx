"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { BookUp, PenLine, TextCursorInput, Trash2, FolderInput, FolderPlus } from "lucide-react";
import { askCategoryPick } from "@/components/CategoryPickDialog";
import { useEscape } from "@/hooks/useEscape";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useT } from "@/i18n/useT";
import { UNCATEGORIZED, menuDangerCls, menuItemCls } from "../constants";
import { allCategories } from "../lib/catTree";
import type { Workspace } from "../hooks/useWorkspace";

/**
 * Document action menu (shared by cards, list rows and sidebar document rows). Portaled to body: cards'
 * rise/hover transforms hijack the containing block for fixed positioning, which would clip the menu.
 *
 * Only one is mounted for the whole workspace (like CategoryContextMenu); the target comes from the `menus.docMenu` anchor.
 * Previously each row mounted its own: N rows meant N sets of Esc/outside-click listeners mounted and unmounted every render, and a document
 * that was in both the sidebar tree and the content list would render two identical menu panels on right-click.
 * Trash rows don't open this menu (no right-click or 「⋯」), so looking it up in library.docs is enough.
 */
export function DocContextMenu({ ws }: { ws: Workspace }) {
  const { menus, nav, library, docActions, auth } = ws;
  const anchor = menus.docMenu;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const t = useT();
  // Esc closes the menu: consistent with dialogs and the slash menu, so users don't need to find blank space to click
  useEscape(menus.closeDocMenu, anchor !== null);
  useDismissMenu(panelRef, menus.closeDocMenu, anchor !== null);
  const doc = anchor ? library.docs?.find((d) => d.id === anchor.id) : undefined;
  // Anchor present but the document is gone (deleted in another tab / list just refreshed): render nothing
  if (!anchor || !doc) return null;
  const cat = doc.category || UNCATEGORIZED;

  const run = (fn: () => void) => () => {
    menus.closeDocMenu();
    fn();
  };

  /** There may be hundreds of deeply nested categories, so open a searchable picker instead of listing them flat in the menu */
  const moveViaPicker = async () => {
    const target = await askCategoryPick({
      title: t("移动「{name}」到文件夹", { name: doc.title || t(UNTITLED_DOC) }),
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
        <PenLine size={14} className="text-[var(--ink-faint)]" />
        {t("编辑")}
      </button>
      <button className={menuItemCls} onClick={run(() => void docActions.renameDoc(doc))}>
        <TextCursorInput size={14} className="text-[var(--ink-faint)]" />
        {t("重命名")}
      </button>
      <button className={menuItemCls} onClick={run(() => void moveViaPicker())}>
        <FolderInput size={14} className="text-[var(--ink-faint)]" />
        {t("移动到文件夹")}
      </button>
      <button className={menuItemCls} onClick={run(() => void docActions.moveToNewCategory(doc))}>
        <FolderPlus size={14} className="text-[var(--ink-faint)]" />
        {t("新建文件夹")}
      </button>
      {!auth.localMode ? (
        <>
          <div className="my-1 border-t border-[var(--hairline)]" />
          <button
            className={menuItemCls}
            onClick={run(() => void docActions.pushToFeishu(doc))}
            disabled={docActions.pushingFeishu}
          >
            <BookUp size={14} className="text-[var(--ink-faint)]" />
            {t("推送到飞书")}
          </button>
        </>
      ) : null}
      <div className="my-1 border-t border-[var(--hairline)]" />
      <button className={menuDangerCls} onClick={run(() => void docActions.removeDoc(doc))}>
        <Trash2 size={14} />
        {t("删除文章")}
      </button>
    </div>,
    document.body
  );
}
