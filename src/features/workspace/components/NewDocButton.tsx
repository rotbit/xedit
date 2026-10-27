"use client";

/**
 * The 「新建文章」 (New document) split button at the right end of the content top bar: the left half creates directly, the right chevron opens the import menu.
 * Two halves of one button rather than two buttons: creating is the frequent primary action while importing happens a few times a year,
 * so it borrows the primary button's spot without taking visual weight.
 * Imports here don't specify a category; the destination uses useImportDocs' "current category" logic;
 * to import into a specific folder, use the file tree's context menu.
 */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookDown, ChevronDown, FileInput, FilePlus2, FolderInput, Loader2, NotebookPen } from "lucide-react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { useT } from "@/i18n/useT";
import { menuItemCls, menuPanelCls } from "../constants";
import type { ImportMode } from "../hooks/useImportDocs";
import type { Workspace } from "../hooks/useWorkspace";

/** Dropdown width: same as the category menu's w-44 */
const MENU_WIDTH = 176;

/** Right-anchored: the menu opens along the button's right edge so it doesn't overflow the screen at the right of the top bar */
interface Anchor {
  top: number;
  right: number;
}

export function NewDocButton({ ws }: { ws: Workspace }) {
  const { auth, docActions, dialogs } = ws;
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const t = useT();
  const close = () => setAnchor(null);
  useEscape(close, anchor !== null);
  useDismissMenu(panelRef, close, anchor !== null);

  /** Clicking the chevron again closes it: the button has data-menu-trigger, so the outside-click logic spares it */
  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAnchor((prev) => (prev ? null : { top: r.bottom + 4, right: window.innerWidth - r.right }));
  };

  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const openImport = (mode: ImportMode) => run(() => dialogs.openImport(mode));

  return (
    <>
      {/* Same family as the view switcher on the left: a low-key outlined control on the panel background, each half a small rounded button,
          lighting up accent-wash only on hover. No more solid accent block: the top bar is meant to be quiet, and a high-contrast slab overpowered the content.
          While creating, the whole button fades together: fading only the left half looks like the button cracked */}
      <div
        className={`ml-2 flex h-8 shrink-0 items-center gap-0.5 rounded-md border border-[var(--hairline)] bg-[var(--panel)] p-0.5 ${docActions.creating ? "opacity-60" : ""}`}
      >
        <button
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded pl-2 pr-2.5 text-[12.5px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--accent-wash)]"
          onClick={() => void docActions.createDoc()}
          disabled={docActions.creating}
        >
          {docActions.creating ? (
            <Loader2 size={14} className="animate-spin text-[var(--ink-faint)]" />
          ) : (
            <FilePlus2 size={14} className="text-[var(--ink-faint)]" />
          )}
          {t("新建文章")}
        </button>
        <button
          className={`flex h-7 w-6 cursor-pointer items-center justify-center rounded text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] ${anchor ? "bg-[var(--accent-wash)] text-[var(--ink)]" : ""}`}
          data-menu-trigger
          title={t("更多新建方式")}
          onClick={toggle}
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {anchor
        ? createPortal(
            <div
              ref={panelRef}
              className={menuPanelCls}
              style={{ top: anchor.top, right: anchor.right, width: MENU_WIDTH }}
            >
              <button className={menuItemCls} onClick={run(() => void docActions.openDailyNote())}>
                <NotebookPen size={14} className="text-[var(--ink-faint)]" />
                {t("今日笔记")}
              </button>
              <div className="my-1 border-t border-[var(--hairline)]" />
              <button className={menuItemCls} onClick={openImport("file")}>
                <FileInput size={14} className="text-[var(--ink-faint)]" />
                {t("导入文件")}
              </button>
              <button className={menuItemCls} onClick={openImport("folder")}>
                <FolderInput size={14} className="text-[var(--ink-faint)]" />
                {t("导入文件夹")}
              </button>
              {/* Feishu import runs server-side, so this option doesn't exist when logged out (local mode) */}
              {auth.loggedIn ? (
                <>
                  <div className="my-1 border-t border-[var(--hairline)]" />
                  <button className={menuItemCls} onClick={run(dialogs.openFeishu)}>
                    <BookDown size={14} className="text-[var(--ink-faint)]" />
                    {t("飞书知识库导入")}
                  </button>
                </>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
