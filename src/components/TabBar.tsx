"use client";

import { useRef } from "react";
import { X, Plus, ArrowLeft, ArrowRight, PanelLeftOpen } from "lucide-react";

export interface TabItem {
  key: string;
  title: string;
  icon: React.ReactNode;
  closeable: boolean;
}

/**
 * Obsidian 式标签栏（唯一顶栏）：左侧抽屉/前进后退 + 可拖拽重排的标签，
 * 右侧 `trailing` 槽放当前视图的动作（编辑器动作 / 卡片列表切换等）。
 */
export function TabBar({
  tabs,
  activeKey,
  onSelect,
  onClose,
  onNew,
  onReorder,
  onOpenDrawer,
  onBack,
  onForward,
  canBack,
  canForward,
  trailing,
}: {
  tabs: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  onNew: () => void;
  onReorder?: (fromKey: string, toKey: string) => void;
  /** 窄屏抽屉按钮 */
  onOpenDrawer?: () => void;
  onBack?: () => void;
  onForward?: () => void;
  canBack?: boolean;
  canForward?: boolean;
  /** 右侧动作区（当前视图相关） */
  trailing?: React.ReactNode;
}) {
  const dragKey = useRef<string | null>(null);

  const navBtn =
    "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[var(--ink-faint)]";

  return (
    <div className="flex h-10 shrink-0 items-stretch border-b border-[var(--hairline)] bg-[var(--sidebar)]">
      {/* 左侧：抽屉 + 前进/后退 */}
      <div className="flex shrink-0 items-center gap-0.5 pl-1.5 pr-1">
        {onOpenDrawer ? (
          <button className={`${navBtn} md:hidden`} title="打开侧栏" onClick={onOpenDrawer}>
            <PanelLeftOpen size={15} />
          </button>
        ) : null}
        {onBack ? (
          <button className={navBtn} title="后退" onClick={onBack} disabled={!canBack}>
            <ArrowLeft size={15} />
          </button>
        ) : null}
        {onForward ? (
          <button className={navBtn} title="前进" onClick={onForward} disabled={!canForward}>
            <ArrowRight size={15} />
          </button>
        ) : null}
      </div>

      {/* 标签（可横向滚动、可拖拽重排） */}
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <div
              key={tab.key}
              role="tab"
              aria-selected={active}
              draggable={Boolean(onReorder)}
              onDragStart={() => {
                dragKey.current = tab.key;
              }}
              onDragOver={(e) => {
                if (onReorder && dragKey.current && dragKey.current !== tab.key) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (onReorder && dragKey.current) onReorder(dragKey.current, tab.key);
                dragKey.current = null;
              }}
              className={`group/tab relative flex min-w-[104px] max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-[var(--hairline)] pl-3 pr-2 text-[12.5px] transition-colors ${
                active
                  ? "bg-[var(--paper)] text-[var(--ink)]"
                  : "text-[var(--ink-soft)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]"
              }`}
              onClick={() => onSelect(tab.key)}
              onMouseDown={(e) => {
                if (e.button === 1 && tab.closeable) {
                  e.preventDefault();
                  onClose(tab.key);
                }
              }}
            >
              {active ? (
                <span className="absolute inset-x-0 top-0 h-[2px] bg-[var(--accent)]" />
              ) : null}
              <span className={active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}>
                {tab.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{tab.title}</span>
              {tab.closeable ? (
                <button
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--ink-faint)] hover:bg-[var(--sidebar-active)] hover:text-[var(--ink)] ${
                    active ? "" : "opacity-0 group-hover/tab:opacity-100"
                  }`}
                  title="关闭标签"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.key);
                  }}
                >
                  <X size={13} />
                </button>
              ) : (
                <span className="h-5 w-5 shrink-0" />
              )}
            </div>
          );
        })}
        <button
          className="flex h-full shrink-0 items-center justify-center px-2.5 text-[var(--ink-faint)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]"
          title="新建文章"
          onClick={onNew}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* 右侧动作区 */}
      {trailing ? (
        <div className="flex shrink-0 items-center gap-1 border-l border-[var(--hairline)] bg-[var(--paper)] pl-2 pr-2">
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
