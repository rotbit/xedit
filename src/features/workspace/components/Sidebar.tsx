"use client";

import { PanelLeftClose, Search } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/LogoMark";
import { useDragDivider } from "@/hooks/useDragDivider";
import { ALL } from "../constants";
import { clampSidebarWidth } from "../hooks/useSidebarPrefs";
import { CategoryTree } from "./CategoryTree";
import { SidebarFooter } from "./SidebarFooter";
import type { ImportMode } from "../hooks/useImportDocs";
import type { Workspace } from "../hooks/useWorkspace";

/**
 * 工作区侧栏：桌面静态常驻；窄屏为 fixed 抽屉，关闭时滑出屏幕。
 * 结构自上而下——工作区头 / 全局搜索 / 统计行 / 分类树 / 工具与账户。
 */
export function Sidebar({
  ws,
  onImport,
  onOpenFeishu,
}: {
  ws: Workspace;
  onImport: (mode: ImportMode) => void;
  onOpenFeishu: () => void;
}) {
  const { nav, prefs, library, menus, totalChars } = ws;
  const { docs } = library;
  /** 统计文字兼作「全部文章」入口：当前就在全部列表时文字加深 */
  const allActive = nav.activeCat === ALL && !nav.readingId;

  /** 右缘手柄拖拽调宽：过程中只用本地值，松手才落盘（与阅读器分隔条同一套 hook） */
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
      {/* app-titlebar / traffic-inset：桌面壳里这条顶栏充当系统标题栏并给红绿灯留位 */}
      <div className="app-titlebar traffic-inset flex h-12 shrink-0 items-center gap-2 pl-4 pr-2">
        <Link
          href="/about"
          className="sidebar-logo shrink-0 rounded-md transition-opacity hover:opacity-75"
          title="产品介绍"
          aria-label="查看 xEdit 产品介绍"
        >
          <LogoMark className="h-7 w-auto text-[var(--ink)]" />
        </Link>
        <span className="flex-1" />
        <button
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]"
          title="收起侧栏"
          onClick={prefs.toggleSidebar}
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div className="shrink-0 px-3 pb-2 pt-0.5">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"
          />
          <input
            className="h-8 w-full rounded-md border border-[var(--hairline)] bg-[var(--panel)] pl-8 pr-9 text-[12.5px] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--hairline-strong)]"
            placeholder={nav.isTrash ? "搜索回收站…" : "搜索文章…"}
            value={nav.search}
            onChange={(e) => nav.onSearch(e.target.value)}
          />
          {/* 快速切换器的入口提示：输入框一有字就让位，窄屏抽屉里也不占地方 */}
          {!nav.search ? (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 text-[10px] text-[var(--ink-faint)] md:block">
              ⌘O
            </kbd>
          ) : null}
        </div>
      </div>

      {/* 统计行不放按钮：新建文件夹 / 刷新 / 新建文章都在右键菜单里（这行和树的空白处都能右键），
          新建文章另有主区域顶部的按钮，侧栏保持只有导航 */}
      <div
        className="flex h-6 shrink-0 items-center pl-4 pr-2.5"
        onContextMenu={(e) => menus.openCatMenuAt(e, ALL)}
      >
        <button
          className={`cursor-pointer text-left text-[11px] transition-colors hover:text-[var(--ink)] disabled:cursor-default disabled:hover:text-[var(--ink-faint)] ${
            allActive ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"
          }`}
          title="查看全部文章"
          disabled={docs === null}
          onClick={() => nav.openCategory(ALL)}
        >
          {docs === null
            ? "同步中…"
            : `${docs.length} 篇文章${totalChars > 0 ? ` · ${totalChars.toLocaleString()} 字` : ""}`}
        </button>
      </div>

      <CategoryTree ws={ws} />
      <SidebarFooter ws={ws} onImport={onImport} onOpenFeishu={onOpenFeishu} />

      {/* 调宽手柄：拖动改宽度，双击回默认；窄屏抽屉不提供 */}
      <div
        className="absolute inset-y-0 -right-px z-10 hidden w-[5px] cursor-col-resize hover:bg-[var(--accent)]/25 active:bg-[var(--accent)]/40 md:block"
        title="拖动调整侧栏宽度，双击恢复默认"
        onPointerDown={resize.onPointerDown}
        onDoubleClick={prefs.resetSidebarWidth}
      />
    </aside>
  );
}
