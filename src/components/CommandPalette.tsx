"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Command as CommandIcon, CornerDownLeft } from "lucide-react";

export interface Command {
  id: string;
  label: string;
  /** 右侧分组/来源提示 */
  hint?: string;
  /** 额外的搜索关键词（拼音/英文别名） */
  keywords?: string;
  icon?: React.ReactNode;
  run: () => void;
}

/**
 * Obsidian 式命令面板：⌘P 唤起，模糊筛选后回车执行。
 * 仅在打开时由父组件挂载（`{open && <CommandPalette/>}`），因此挂载即复位，无需 effect 重置。
 */
export function CommandPalette({
  onClose,
  commands,
}: {
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const tokens = q.split(/\s+/);
    return commands.filter((c) => {
      const hay = `${c.label} ${c.keywords ?? ""} ${c.hint ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [commands, query]);

  // active 可能因筛选变短而越界，渲染时就地夹取，避免 effect 里 setState
  const activeIdx = filtered.length ? Math.min(active, filtered.length - 1) : 0;

  // 挂载即聚焦输入框（纯 DOM 副作用，不触发 setState）
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // 选中项滚入视野
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const runAt = (idx: number) => {
    const cmd = filtered[idx];
    if (!cmd) return;
    onClose();
    // 关闭后再执行，避免命令触发的弹窗/聚焦与关闭动画打架
    requestAnimationFrame(() => cmd.run());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((filtered.length ? (activeIdx + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(filtered.length ? (activeIdx - 1 + filtered.length) % filtered.length : 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(activeIdx);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-[13vh] backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--panel)] shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 输入行 */}
        <div className="flex items-center gap-2.5 border-b border-[var(--hairline)] px-4">
          <CommandIcon size={16} className="shrink-0 text-[var(--ink-faint)]" />
          <input
            ref={inputRef}
            className="h-12 w-full bg-transparent text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            placeholder="输入命令…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <kbd className="shrink-0 rounded border border-[var(--hairline)] px-1.5 py-0.5 text-[10px] text-[var(--ink-faint)]">
            Esc
          </kbd>
        </div>
        {/* 命令列表 */}
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--ink-faint)]">
              没有匹配的命令
            </p>
          ) : (
            filtered.map((cmd, i) => {
              const on = i === activeIdx;
              return (
                <button
                  key={cmd.id}
                  data-idx={i}
                  className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors ${
                    on ? "bg-[var(--accent-wash)]" : "hover:bg-[var(--sidebar-hover)]"
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runAt(i)}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center ${
                      on ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"
                    }`}
                  >
                    {cmd.icon}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-[13.5px] ${
                      on ? "text-[var(--ink)]" : "text-[var(--ink-soft)]"
                    }`}
                  >
                    {cmd.label}
                  </span>
                  {cmd.hint ? (
                    <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">{cmd.hint}</span>
                  ) : null}
                  {on ? (
                    <CornerDownLeft size={13} className="shrink-0 text-[var(--ink-faint)]" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
