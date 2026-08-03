"use client";

import { createPortal } from "react-dom";
import { BookUp, PenLine, TextCursorInput, Trash2, Folder, FolderPlus } from "lucide-react";
import { menuDangerCls, menuItemCls } from "../constants";
import { allCategories } from "../lib/catTree";
import type { DocMeta } from "../types";
import type { Workspace } from "../hooks/useWorkspace";

/** 移动到分类的候选上限，超出部分靠「新建分类…」兜底 */
const MOVE_TARGET_LIMIT = 12;

/**
 * 文档操作菜单（卡片、列表行与侧栏文章行共用）。portal 到 body：卡片的
 * rise/hover transform 会劫持 fixed 定位的 containing block，导致菜单被裁剪。
 */
export function DocContextMenu({
  ws,
  doc,
  cat,
}: {
  ws: Workspace;
  doc: DocMeta;
  cat: string;
}) {
  const { menus, nav, library, docActions, auth } = ws;
  const anchor = menus.docMenu;
  if (anchor?.id !== doc.id) return null;

  const targets = allCategories(library.customCats, library.docs)
    .filter((c) => c !== cat)
    .slice(0, MOVE_TARGET_LIMIT);

  const run = (fn: () => void) => () => {
    menus.closeDocMenu();
    fn();
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-30"
        onClick={(e) => {
          e.stopPropagation();
          menus.closeDocMenu();
        }}
        onWheel={menus.closeDocMenu}
        onTouchMove={menus.closeDocMenu}
      />
      <div
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
        <p className="px-3.5 pb-1 pt-1.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
          移动到分类
        </p>
        {targets.map((c) => (
          <button
            key={c}
            className={menuItemCls}
            onClick={run(() => void docActions.moveDoc(doc, c))}
          >
            <Folder size={13} className="shrink-0 text-[var(--ink-faint)]" />
            <span className="truncate">{c}</span>
          </button>
        ))}
        <button
          className={menuItemCls}
          onClick={run(() => void docActions.moveToNewCategory(doc))}
        >
          <FolderPlus size={13} className="text-[var(--ink-faint)]" />
          新建分类…
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
      </div>
    </>,
    document.body
  );
}
