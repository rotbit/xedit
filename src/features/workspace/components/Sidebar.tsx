"use client";

import { useEffect, useRef } from "react";
import { FilePlus2, Loader2, PanelLeftClose, RotateCw, Search } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/LogoMark";
import { TAG_OPEN_EVENT } from "@/lib/tagEvents";
import { CategoryTree } from "./CategoryTree";
import { SidebarFooter } from "./SidebarFooter";
import { TagList, searchTag } from "./TagList";
import type { Workspace } from "../hooks/useWorkspace";

const toolBtn =
  "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--sidebar-active)] disabled:opacity-60";

/**
 * 工作区侧栏：桌面静态常驻；窄屏为 fixed 抽屉，关闭时滑出屏幕。
 * 结构自上而下——工作区头 / 全局搜索 / 统计行 / 分类树 / 工具与账户。
 */
export function Sidebar({
  ws,
  onOpenFeishu,
}: {
  ws: Workspace;
  onOpenFeishu: () => void;
}) {
  const { nav, prefs, library, docActions, totalChars } = ws;
  const { docs } = library;

  // 编辑器/预览里点中的 `#标签` 在这里落地：渲染层只派事件，筛文章的活归侧栏（见 lib/tagEvents.ts）。
  // nav 每次渲染都是新对象，用 ref 兜最新值，监听器只挂一次
  const latestNav = useRef(nav);
  useEffect(() => {
    latestNav.current = nav;
  });
  useEffect(() => {
    const onOpenTag = (event: Event) => {
      const tag = (event as CustomEvent<{ tag?: string }>).detail?.tag?.trim();
      if (tag) searchTag(latestNav.current, tag);
    };
    window.addEventListener(TAG_OPEN_EVENT, onOpenTag);
    return () => window.removeEventListener(TAG_OPEN_EVENT, onOpenTag);
  }, []);

  /** 右缘手柄拖拽调宽：过程中只改状态，松手才落盘 */
  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = prefs.sidebarWidth;
    const onMove = (ev: PointerEvent) => prefs.setSidebarWidth(startW + ev.clientX - startX, false);
    const onUp = (ev: PointerEvent) => {
      prefs.setSidebarWidth(startW + ev.clientX - startX);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex max-w-[85vw] shrink-0 flex-col bg-[var(--sidebar)] transition-transform duration-200 md:relative md:translate-x-0 ${
        prefs.sidebarOpen ? "" : "-translate-x-full md:hidden"
      }`}
      style={{ width: prefs.sidebarWidth }}
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

      <div className="flex shrink-0 items-center justify-between pl-4 pr-2.5">
        <span className="text-[11px] text-[var(--ink-faint)]">
          {docs === null
            ? "同步中…"
            : `${docs.length} 篇文章${totalChars > 0 ? ` · ${totalChars.toLocaleString()} 字` : ""}`}
        </span>
        <span className="flex items-center">
          <button
            className={`${toolBtn} hover:text-[var(--ink)]`}
            title="刷新列表"
            onClick={() => void docActions.refreshDocs()}
            disabled={docActions.refreshing}
          >
            <RotateCw size={12} className={docActions.refreshing ? "animate-spin" : ""} />
          </button>
          <button
            className={`${toolBtn} hover:text-[var(--accent-deep)]`}
            title="新建文章"
            onClick={() => void docActions.createDoc()}
            disabled={docActions.creating}
          >
            {docActions.creating ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <FilePlus2 size={13} />
            )}
          </button>
        </span>
      </div>

      <CategoryTree ws={ws} />
      <TagList ws={ws} />
      <SidebarFooter ws={ws} onOpenFeishu={onOpenFeishu} />

      {/* 调宽手柄：拖动改宽度，双击回默认；窄屏抽屉不提供 */}
      <div
        className="absolute inset-y-0 -right-px z-10 hidden w-[5px] cursor-col-resize hover:bg-[var(--accent)]/25 active:bg-[var(--accent)]/40 md:block"
        title="拖动调整侧栏宽度，双击恢复默认"
        onPointerDown={onResizeStart}
        onDoubleClick={prefs.resetSidebarWidth}
      />
    </aside>
  );
}
