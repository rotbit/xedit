"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscape } from "@/hooks/useEscape";

/**
 * 命令面板（⌘⇧P）与快速切换器（⌘O）的共用外壳：portal 遮罩 + 搜索框 + 结果列表，
 * 外加键盘导航（↑↓ 选、↵ 定、Esc 关）和「高亮项滚进视野」。两个面板视觉完全一致，
 * 所以外壳只留一份，各自只管数据源与行内容。
 *
 * 检索词由调用方持有（切换器要在外面防抖），高亮位置由这里持有。
 */
export function PaletteShell<T>({
  open,
  icon,
  placeholder,
  hint,
  query,
  onQueryChange,
  resetKey,
  items,
  keyOf,
  renderItem,
  itemAlign = "center",
  emptyText,
  listTop,
  onPick,
  onClose,
}: {
  open: boolean;
  /** 搜索框左侧的图标 */
  icon: React.ReactNode;
  placeholder: string;
  /** 右侧键位提示（窄屏隐藏） */
  hint: string;
  query: string;
  onQueryChange: (query: string) => void;
  /** 变化即把高亮拉回第一条：命令面板传关键词本身，切换器传防抖后的关键词 */
  resetKey: string;
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  /** 行内元素纵向对齐：单行的命令居中，带摘要两行的搜索结果顶对齐 */
  itemAlign?: "center" | "start";
  emptyText: string;
  /** 列表顶部的固定内容（如「最近编辑」小标题），有结果时才出 */
  listTop?: React.ReactNode;
  onPick: (item: T) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const activeRef = useRef<HTMLButtonElement>(null);

  // 每次打开都从第一条开始。渲染期间带守卫地重置，放 effect 里会多跑一帧、先闪一下旧高亮
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIndex(0);
  }

  // 换了词就回到第一条，否则高亮会停在一个已经不存在的位置上
  const [lastKey, setLastKey] = useState(resetKey);
  if (resetKey !== lastKey) {
    setLastKey(resetKey);
    setIndex(0);
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [index, items]);

  useEscape(onClose, open);

  if (!open) return null;

  const move = (step: number) =>
    setIndex((i) => (items.length === 0 ? 0 : (i + step + items.length) % items.length));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = items[index];
      if (hit) onPick(hit);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/25 px-4 pt-[15vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="float-pop flex max-h-[70vh] w-[560px] max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--panel)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--hairline)] px-4">
          {icon}
          <input
            autoFocus
            className="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            placeholder={placeholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="hidden shrink-0 text-[11px] text-[var(--ink-faint)] sm:block">
            {hint}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="px-3 py-10 text-center text-[13px] text-[var(--ink-faint)]">
              {emptyText}
            </p>
          ) : (
            <>
              {listTop}
              {items.map((item, i) => {
                const active = i === index;
                return (
                  <button
                    key={keyOf(item)}
                    ref={active ? activeRef : undefined}
                    className={`flex w-full cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      itemAlign === "start" ? "items-start" : "items-center"
                    } ${active ? "bg-[var(--accent-wash)]" : ""}`}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => onPick(item)}
                  >
                    {renderItem(item)}
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
