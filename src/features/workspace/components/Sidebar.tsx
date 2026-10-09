"use client";

import { useMemo } from "react";
import { CalendarCheck, Library, PanelLeftClose, Plus, Search } from "lucide-react";
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
import { ALL, TODAY } from "../constants";
import { clampSidebarWidth } from "../hooks/useSidebarPrefs";
import { CategoryTree } from "./CategoryTree";
import { NavRow } from "./NavRow";
import { SidebarFooter } from "./SidebarFooter";
import type { Workspace } from "../hooks/useWorkspace";

/**
 * 工作区侧栏：桌面静态常驻；窄屏为 fixed 抽屉，关闭时滑出屏幕。
 * 结构自上而下——工作区头 / 全局搜索 / 今天 · 全部文章 / 「文件夹」小标题 + 分类树 / 工具与账户。
 * 全部行共用一套网格（左内边距 8px + 14px 图标位 + 8px 间距 + 文字），图标、文字各自对齐成一条线。
 */
export function Sidebar({ ws }: { ws: Workspace }) {
  const { nav, prefs, library, menus, catActions } = ws;
  const { docs } = library;
  const t = useT();
  const allActive = nav.activeCat === ALL && !nav.readingId;
  const todayActive = nav.activeCat === TODAY && !nav.readingId;
  /** 「今天」右侧的数：逾期 + 今天到期，含清单里没定日期的。
   *  文库每次自动保存都换引用，collectTodos 按 updatedAt 缓存解析结果，重算只是遍历一遍 */
  const { allDocs } = library;
  const todoCount = useMemo(() => {
    // 要连待办清单那篇一起看（它不在可见列表 docs 里）
    if (!allDocs) return 0;
    const today = todayKey();
    return actionableCount(bucketTodos(collectTodos(allDocs, today), today));
  }, [allDocs]);

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

      {/* 与下面各行同一网格：放大镜落在 8px，文字落在 30px */}
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
          {/* 快速切换器的入口提示：输入框一有字就让位，窄屏抽屉里也不占地方 */}
          {!nav.search ? (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 text-[10px] text-[var(--ink-faint)] md:block">
              ⌘O
            </kbd>
          ) : null}
        </div>
      </div>

      {/* 视图组：靠位置表明身份——搜索之下、文件夹之上的两条固定入口 */}
      <div className="flex shrink-0 flex-col gap-0.5 px-2">
        <NavRow
          icon={<CalendarCheck size={14} />}
          label={t("今天")}
          active={todayActive}
          count={todoCount}
          onClick={() => nav.openCategory(TODAY)}
        />
        {/* 右键兼作根级菜单（新建文章 / 新建文件夹 / 刷新 / 导入） */}
        <NavRow
          icon={<Library size={14} />}
          label={t("全部文章")}
          active={allActive}
          disabled={docs === null}
          onClick={() => nav.openCategory(ALL)}
          onContextMenu={(e) => menus.openCatMenuAt(e, ALL)}
        />
      </div>

      {/* 「文件夹」小标题：只标出下面是文件夹树，不可点；悬停露出「＋」新建顶级文件夹 */}
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

      {/* 调宽手柄：拖动改宽度，双击回默认；窄屏抽屉不提供 */}
      <div
        className="absolute inset-y-0 -right-px z-10 hidden w-[5px] cursor-col-resize hover:bg-[var(--accent)]/25 active:bg-[var(--accent)]/40 md:block"
        title={t("拖动调整侧栏宽度，双击恢复默认")}
        onPointerDown={resize.onPointerDown}
        onDoubleClick={prefs.resetSidebarWidth}
      />
    </aside>
  );
}
