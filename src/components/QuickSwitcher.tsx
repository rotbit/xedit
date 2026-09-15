"use client";

// Obsidian 式快速切换器（⌘O / ⌘P）：打字即搜标题与正文，↑↓ 选、↵ 开。
// 检索本身在 lib/docSearch 里跑（纯 localStorage，离线可用），这里只管弹窗与键盘。

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Search } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import { MatchHighlight } from "./MatchHighlight";
import { matchRanges, searchDocs, splitQuery } from "@/lib/docSearch";
import { UNCATEGORIZED } from "@/features/workspace/constants";
import { formatTime } from "@/features/workspace/lib/docSource";
import type { DocMeta } from "@/features/workspace/types";

/** 一次最多列 30 条：再多也翻不动，键盘选择反而变慢 */
const LIMIT = 30;
/** 击键到检索之间的防抖：正文要逐篇读 localStorage，每键一读太亏 */
const DEBOUNCE_MS = 120;

export function QuickSwitcher({
  open,
  docs,
  onClose,
  onOpen,
}: {
  open: boolean;
  docs: DocMeta[];
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [index, setIndex] = useState(0);
  const activeRef = useRef<HTMLButtonElement>(null);

  // 每次打开都是一次全新的检索：上次的关键词与选中项不留到下一次。
  // 渲染期间带守卫地重置（React 推荐模式，同 useWorkspaceNav 消费 ?doc 的写法），
  // 放 effect 里会多跑一帧——弹窗会先闪一下上次的结果
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setDebounced("");
      setIndex(0);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // open 与 wasOpen 不齐的那一帧是上面重置触发的重渲染前夜，关键词还是上一次的：
  // 此时不搜，免得拿一个作废的词白扫一遍全库正文（几百篇就是几百次 localStorage 读）
  const hits = useMemo(
    () => (open && open === wasOpen ? searchDocs(docs, debounced, { limit: LIMIT }) : []),
    [open, wasOpen, docs, debounced]
  );
  const terms = useMemo(() => splitQuery(debounced), [debounced]);

  // 换了词就回到第一条，否则高亮会停在一个已经不存在的位置上
  const [lastQuery, setLastQuery] = useState(debounced);
  if (debounced !== lastQuery) {
    setLastQuery(debounced);
    setIndex(0);
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [index, hits]);

  useEscape(onClose, open);

  if (!open) return null;

  const move = (step: number) =>
    setIndex((i) => (hits.length === 0 ? 0 : (i + step + hits.length) % hits.length));

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
      if (hit) onOpen(hit.doc.id);
    }
  };

  const q = debounced.trim();

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
          <Search size={15} className="shrink-0 text-[var(--ink-faint)]" />
          <input
            autoFocus
            className="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            placeholder="搜索文章标题或正文…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="hidden shrink-0 text-[11px] text-[var(--ink-faint)] sm:block">
            ↑↓ 选择 · ↵ 打开 · esc 关闭
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {hits.length === 0 ? (
            <p className="px-3 py-10 text-center text-[13px] text-[var(--ink-faint)]">
              {q ? `没有找到「${q}」` : "还没有文章"}
            </p>
          ) : (
            <>
              {q ? null : (
                <p className="px-2.5 pb-1 pt-1 text-[11px] text-[var(--ink-faint)]">最近编辑</p>
              )}
              {hits.map((hit, i) => {
                const { doc } = hit;
                const title = doc.title || "未命名文章";
                const active = i === index;
                return (
                  <button
                    key={doc.id}
                    ref={active ? activeRef : undefined}
                    className={`flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      active ? "bg-[var(--accent-wash)]" : ""
                    }`}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => onOpen(doc.id)}
                  >
                    <FileText size={13} className="mt-[3px] shrink-0 text-[var(--ink-faint)]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--ink)]">
                          <MatchHighlight text={title} ranges={matchRanges(title, terms)} />
                        </span>
                        <span className="max-w-[9rem] shrink-0 truncate text-[11px] text-[var(--ink-faint)]">
                          {doc.category || UNCATEGORIZED}
                        </span>
                        <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">
                          {formatTime(doc.updatedAt)}
                        </span>
                      </span>
                      {hit.snippet ? (
                        <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-soft)]">
                          <MatchHighlight text={hit.snippet} ranges={hit.ranges} />
                        </span>
                      ) : null}
                    </span>
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
