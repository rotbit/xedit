"use client";

import { FilePlus2, Loader2, PanelLeftClose, RotateCw, Search } from "lucide-react";
import { CategoryTree } from "./CategoryTree";
import { SidebarFooter } from "./SidebarFooter";
import type { Workspace } from "../hooks/useWorkspace";

const toolBtn =
  "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--sidebar-active)] disabled:opacity-60";

/**
 * 工作区侧栏：桌面静态常驻；窄屏为 fixed 抽屉，关闭时滑出屏幕。
 * 结构自上而下——工作区头 / 全局搜索 / 统计行 / 分类树 / 工具与账户。
 */
export function Sidebar({
  ws,
  onOpenSettings,
  onOpenFeishu,
}: {
  ws: Workspace;
  onOpenSettings: () => void;
  onOpenFeishu: () => void;
}) {
  const { nav, prefs, library, docActions, totalChars } = ws;
  const { docs } = library;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-[248px] shrink-0 flex-col bg-[var(--sidebar)] transition-transform duration-200 md:static md:translate-x-0 ${
        prefs.sidebarOpen ? "" : "-translate-x-full md:hidden"
      }`}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 pl-4 pr-2">
        <span className="text-[15px] font-semibold tracking-wide [font-family:var(--serif)]">
          xEdit
        </span>
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
            className="h-8 w-full rounded-md border border-[var(--hairline)] bg-[var(--panel)] pl-8 pr-2.5 text-[12.5px] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--hairline-strong)]"
            placeholder={nav.isTrash ? "搜索回收站…" : "搜索文章…"}
            value={nav.search}
            onChange={(e) => nav.onSearch(e.target.value)}
          />
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
      <SidebarFooter ws={ws} onOpenSettings={onOpenSettings} onOpenFeishu={onOpenFeishu} />
    </aside>
  );
}
