"use client";

import {
  Files,
  Search,
  Command,
  Footprints,
  Images,
  Trash2,
} from "lucide-react";
import { DarkToggle } from "./DarkToggle";

export type RibbonView = "stats" | "assets" | "trash";

/** Obsidian 式左侧活动栏：~44px 竖向图标条，切换侧栏 / 搜索 / 命令面板 / 主视图 */
export function ActivityRibbon({
  sidebarOpen,
  onToggleSidebar,
  onSearch,
  onCommandPalette,
  activeView,
  onOpenView,
  loggedIn,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSearch: () => void;
  onCommandPalette: () => void;
  activeView: RibbonView | null;
  onOpenView: (v: RibbonView) => void;
  loggedIn: boolean;
}) {
  const base =
    "flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-colors";
  const idle =
    "text-[var(--ink-faint)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]";
  const on = "bg-[var(--sidebar-active)] text-[var(--accent)]";

  const item = (
    active: boolean,
    icon: React.ReactNode,
    label: string,
    onClick: () => void
  ) => (
    <button
      className={`${base} ${active ? on : idle}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
    </button>
  );

  return (
    <nav className="hidden w-[46px] shrink-0 flex-col items-center gap-1 border-r border-[var(--hairline)] bg-[var(--ribbon)] py-2 md:flex">
      {item(
        sidebarOpen && !activeView,
        <Files size={18} />,
        sidebarOpen ? "收起文件栏" : "展开文件栏",
        onToggleSidebar
      )}
      {item(false, <Search size={18} />, "搜索文章", onSearch)}
      {item(false, <Command size={17} />, "命令面板 (⌘P)", onCommandPalette)}

      {loggedIn ? (
        <>
          <span className="my-1 h-px w-5 bg-[var(--hairline)]" />
          {item(
            activeView === "stats",
            <Footprints size={18} />,
            "写作足迹",
            () => onOpenView("stats")
          )}
          {item(
            activeView === "assets",
            <Images size={18} />,
            "图片库",
            () => onOpenView("assets")
          )}
          {item(
            activeView === "trash",
            <Trash2 size={17} />,
            "回收站",
            () => onOpenView("trash")
          )}
        </>
      ) : null}

      <span className="flex-1" />
      <DarkToggle />
    </nav>
  );
}
