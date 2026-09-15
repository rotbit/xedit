"use client";

// Obsidian 式命令面板（⌘⇧P）：打字即筛全站命令，↑↓ 选、↵ 执行，不用记菜单藏在哪。
// 命令本身由各宿主注册进 lib/commandRegistry，这里只管弹窗、过滤与键盘。
// 视觉与交互跟快速切换器（QuickSwitcher）完全一致：同一个 portal、宽度、圆角、行高、高亮色。

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Command as CommandIcon } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import {
  commandsSnapshot,
  filterCommands,
  isAvailable,
  subscribeCommands,
  type Command,
} from "@/lib/commandRegistry";

const NONE: Command[] = [];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const activeRef = useRef<HTMLButtonElement>(null);

  // 注册表是模块级可变状态，订阅它拿快照（引用在注册表不变时稳定，不会触发无限重渲染）
  const all = useSyncExternalStore(subscribeCommands, commandsSnapshot, commandsSnapshot);

  // 每次打开都是一次全新的检索：上次的关键词与选中项不留到下一次。
  // 渲染期间带守卫地重置（同 QuickSwitcher），放 effect 里会多跑一帧、弹窗先闪一下旧结果
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }

  // 命令表不读 localStorage，过滤纯粹是字符串比对，不必像切换器那样防抖。
  // open 进 deps 不只是省一次空跑：when() 的结果跟界面状态走，每次打开都要重新问一遍
  const hits = useMemo(
    () => (open ? filterCommands(all.filter(isAvailable), query) : NONE),
    [open, all, query]
  );

  // 换了词就回到第一条，否则高亮会停在一个已经不存在的位置上
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setIndex(0);
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [index, hits]);

  useEscape(onClose, open);

  if (!open) return null;

  const move = (step: number) =>
    setIndex((i) => (hits.length === 0 ? 0 : (i + step + hits.length) % hits.length));

  /**
   * 先收面板再同步执行：格式类命令会把焦点抢回编辑器，此时输入框已不是 activeElement，
   * React 随后卸载它也就不会把焦点甩回 body。异步命令（复制/导出）也保持在用户手势这一拍里，
   * 否则 Safari 会判定剪贴板写入失去用户激活
   */
  const run = (cmd: Command) => {
    onClose();
    void (async () => cmd.run())().catch((e) => {
      // 命令自己负责给用户提示（toast），这里只兜住漏网的异常，别静默吞掉
      console.error("[command] 执行失败", cmd.id, e);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[index];
      if (hit) run(hit);
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
          <CommandIcon size={15} className="shrink-0 text-[var(--ink-faint)]" />
          <input
            autoFocus
            className="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            placeholder="搜索命令…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="hidden shrink-0 text-[11px] text-[var(--ink-faint)] sm:block">
            ↑↓ 选择 · ↵ 执行 · esc 关闭
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {hits.length === 0 ? (
            <p className="px-3 py-10 text-center text-[13px] text-[var(--ink-faint)]">
              没有匹配的命令
            </p>
          ) : (
            hits.map((cmd, i) => {
              const active = i === index;
              return (
                <button
                  key={cmd.id}
                  ref={active ? activeRef : undefined}
                  className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    active ? "bg-[var(--accent-wash)]" : ""
                  }`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(cmd)}
                >
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--ink)]">
                    <span className="text-[var(--ink-faint)]">{cmd.group} › </span>
                    {cmd.label}
                  </span>
                  {cmd.keys ? (
                    <kbd className="shrink-0 font-sans text-[11px] text-[var(--ink-faint)]">
                      {cmd.keys}
                    </kbd>
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
