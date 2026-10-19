"use client";

import { useMemo } from "react";
import { CalendarCheck, PanelLeftClose, Plus, Search } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/LogoMark";
import { useDragDivider } from "@/hooks/useDragDivider";
import { useT } from "@/i18n/useT";
import {
  actionableCount,
  bucketTodos,
  collectTodos,
} from "@/lib/todos/collect";
import { todayKey } from "@/lib/todos/dates";
import { ALL, HISTORY, TODAY } from "../constants";
import { clampSidebarWidth } from "../hooks/useSidebarPrefs";
import { CategoryTree } from "./CategoryTree";
import { NavRow } from "./NavRow";
import { SidebarFooter } from "./SidebarFooter";
import type { Workspace } from "../hooks/useWorkspace";

/**
 * Workspace sidebar: statically docked on desktop; on narrow screens a fixed drawer that slides off-screen when closed.
 * Structure top to bottom: workspace header / global search / Today / 「文件夹」 (Folders) heading + category tree / tools and account.
 * All rows share one grid (8px left padding + 14px icon slot + 8px gap + text), so icons and text each line up vertically.
 */
export function Sidebar({ ws }: { ws: Workspace }) {
  const { nav, prefs, library, menus, catActions } = ws;
  const t = useT();
  // 「历史已完成」 (Completed history) is a subpage of Today, so 「今天」 (Today) stays highlighted while there
  const todayActive = (nav.activeCat === TODAY || nav.activeCat === HISTORY) && !nav.readingId;
  /** The number next to 「今天」 (Today): overdue + due today, including undated items in the list.
   *  The library changes reference on every autosave; collectTodos caches parse results by updatedAt, so recomputing is just one pass */
  const { allDocs } = library;
  const todoCount = useMemo(() => {
    // Must include the todo list document too (it's not in the visible docs list)
    if (!allDocs) return 0;
    const today = todayKey();
    return actionableCount(bucketTodos(collectTodos(allDocs, today), today));
  }, [allDocs]);

  /** Drag the right-edge handle to resize: uses a local value while dragging and persists on release (same hook as the reader's divider) */
  const resize = useDragDivider<{ x: number; w: number }>({
    start: (e) => ({ x: e.clientX, w: prefs.sidebarWidth }),
    move: (ev, from) => clampSidebarWidth(from.w + ev.clientX - from.x),
    commit: prefs.setSidebarWidth,
  });
  const shownWidth = resize.value ?? prefs.sidebarWidth;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex max-w-[85vw] shrink-0 flex-col bg-[var(--sidebar)] transition-transform duration-200 md:relative md:translate-x-0 ${
        prefs.sidebarOpen ? "" : "-translate-x-full md:hidden"
      }`}
      style={{ width: shownWidth }}
    >
      {/* app-titlebar / traffic-inset: in the desktop shell this top bar acts as the system title bar and leaves room for the traffic lights */}
      <div className="app-titlebar traffic-inset flex h-12 shrink-0 items-center gap-2 pl-4 pr-2">
        <Link
          href="/about"
          className="sidebar-logo shrink-0 rounded-md transition-opacity hover:opacity-75"
          title={t("产品介绍")}
          aria-label={t("查看 xEdit 产品介绍")}
        >
          <LogoMark className="h-7 w-auto text-[var(--ink)]" />
        </Link>
        <span className="flex-1" />
        <button
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]"
          title={t("收起侧栏")}
          onClick={prefs.toggleSidebar}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      {/* Same grid as the rows below: the magnifier lands at 8px, the text at 30px */}
      <div className="shrink-0 px-2 pb-2 pt-0.5">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"
          />
          <input
            className="h-7 w-full rounded-md bg-[var(--panel)] pl-[30px] pr-9 text-[12.5px] outline-none ring-[var(--hairline-strong)] transition-shadow placeholder:text-[var(--ink-faint)] focus:ring-1"
            placeholder={nav.isTrash ? t("搜索回收站…") : t("搜索文章…")}
            value={nav.search}
            onChange={(e) => nav.onSearch(e.target.value)}
          />
          {/* Hint for the quick switcher: yields as soon as the input has text, and takes no space in the narrow-screen drawer */}
          {!nav.search ? (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 text-[10px] text-[var(--ink-faint)] md:block">
              ⌘O
            </kbd>
          ) : null}
        </div>
      </div>

      {/* View entries: below search, above folders. 「今天」 (Today) is the home page: todos + recently written;
         the cross-folder timeline (ALL view) no longer has its own row; it's reached from Today's 「最近在写 · 全部」 (Recently written · All) */}
      <div className="flex shrink-0 flex-col gap-0.5 px-2">
        <NavRow
          icon={<CalendarCheck size={14} />}
          label={t("今天")}
          active={todayActive}
          count={todoCount}
          onClick={() => nav.openCategory(TODAY)}
        />
      </div>

      {/* The 「文件夹」 (Folders) heading: just labels the folder tree below, not clickable; hovering reveals 「＋」 to create a top-level folder */}
      <div className="mt-3 shrink-0 px-2">
        <div
          className="group flex h-[22px] items-center px-2 text-[11px] text-[var(--ink-faint)]"
          onContextMenu={(e) => menus.openCatMenuAt(e, ALL)}
        >
          <span className="min-w-0 flex-1 truncate">{t("文件夹")}</span>
          <button
            className="hidden h-[18px] w-[18px] cursor-pointer items-center justify-center rounded text-[var(--ink-faint)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)] group-hover:flex"
            title={t("新建文件夹")}
            onClick={() => void catActions.createCategory()}
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      <CategoryTree ws={ws} />
      <SidebarFooter ws={ws} />

      {/* Resize handle: drag to change width, double-click to reset; not offered in the narrow-screen drawer */}
      <div
        className="absolute inset-y-0 -right-px z-10 hidden w-[5px] cursor-col-resize hover:bg-[var(--accent)]/25 active:bg-[var(--accent)]/40 md:block"
        title={t("拖动调整侧栏宽度，双击恢复默认")}
        onPointerDown={resize.onPointerDown}
        onDoubleClick={prefs.resetSidebarWidth}
      />
    </aside>
  );
}
