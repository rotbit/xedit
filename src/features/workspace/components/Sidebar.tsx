"use client";

import { useMemo } from "react";
import { CalendarCheck, PanelLeftClose, Search } from "lucide-react";
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
import { ALL, TODAY, countCls, rowCls } from "../constants";
import { clampSidebarWidth } from "../hooks/useSidebarPrefs";
import { CategoryTree } from "./CategoryTree";
import { SidebarFooter } from "./SidebarFooter";
import type { Workspace } from "../hooks/useWorkspace";

/** 侧栏虚拟入口行：和 CategoryRow 同样的高度，但图标顶格——它不是树上的一个分类，不该去对齐文件夹图标 */
function NavRow({
  icon,
  label,
  active,
  count = 0,
  disabled,
  onClick,
  onContextMenu,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  count?: number;
  disabled?: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      className={`flex w-full cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors disabled:cursor-default ${rowCls(active)}`}
      style={{ paddingLeft: "8px" }}
      disabled={disabled}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <span
        className={active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}
      >
        {icon}
      </span>
      <span className="ml-1 min-w-0 flex-1 truncate">{label}</span>
      {count > 0 ? (
        <span className={`rounded-full px-1.5 text-[11px] ${countCls(active)}`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

/**
 * 工作区侧栏：桌面静态常驻；窄屏为 fixed 抽屉，关闭时滑出屏幕。
 * 结构自上而下——工作区头 / 全局搜索 / 今天 · 全部文章 / 分类树 / 工具与账户。
 */
export function Sidebar({ ws }: { ws: Workspace }) {
  const { nav, prefs, library, menus } = ws;
  const { docs } = library;
  const t = useT();
  const allActive = nav.activeCat === ALL && !nav.readingId;
  const todayActive = nav.activeCat === TODAY && !nav.readingId;
  /** 「今天」右侧的数：逾期 + 今天到期 + 清单里没定日期的。
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

      <div className="shrink-0 px-3 pb-2 pt-0.5">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"
          />
          <input
            className="h-8 w-full rounded-md border border-[var(--hairline)] bg-[var(--panel)] pl-8 pr-9 text-[12.5px] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--hairline-strong)]"
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

      {/* 「今天」是固定入口：行高与树一致，图标与下面「文章」标题左缘对齐，三者不再一个缩进一个顶格 */}
      <div className="mt-1 shrink-0 px-2">
        <NavRow
          icon={<CalendarCheck size={14} />}
          label={t("今天")}
          active={todayActive}
          count={todoCount}
          onClick={() => nav.openCategory(TODAY)}
        />
        {/* 分类树的标题行，本身就是「全部文章」入口：它是这一组的总目录而不是并列的一个分类，
            所以不给图标、不给灰底，选中只把字加深；兼作根分类的右键菜单（新建文件夹 / 刷新 / 导入） */}
        <button
          className={`mt-2.5 flex w-full cursor-pointer items-center rounded-md px-2 py-1 text-left text-[12px] font-medium transition-colors disabled:cursor-default ${
            allActive
              ? "text-[var(--ink)]"
              : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
          }`}
          disabled={docs === null}
          onClick={() => nav.openCategory(ALL)}
          onContextMenu={(e) => menus.openCatMenuAt(e, ALL)}
          title={t("全部文章")}
        >
          <span className="min-w-0 flex-1 truncate">{t("文章")}</span>
          {docs && docs.length > 0 ? (
            <span className="tabular-nums font-normal">{docs.length}</span>
          ) : null}
        </button>
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
