"use client";

// 一条审核意见的卡片。四种样子：
// 待处理（说的是哪一句 + 问题 + 改写对照 + 按钮）、已采纳 / 已知道（缩成一行淡下去）、
// 原文已修改（灰掉，没得采纳）。

import { Check, Undo2 } from "lucide-react";
import { diffQuote } from "./diff";
import { tint } from "./colors";
import type { ReviewCategory, ReviewItemView } from "./types";

const actionBtn =
  "cursor-pointer rounded-md px-2 py-[3px] text-[11px] transition-colors disabled:cursor-default disabled:opacity-40";

/** 改写对照：删掉的划红线，新加的标绿，没动的按原样 */
function SuggestionDiff({ quote, suggestion }: { quote: string; suggestion: string }) {
  const d = diffQuote(quote, suggestion);
  return (
    <p className="mt-1 break-words rounded-md bg-[var(--paper)] px-2 py-1.5 text-[12px] leading-relaxed">
      <span className="text-[var(--ink-soft)]">{d.prefix}</span>
      {d.removed ? (
        <del className="text-red-600 decoration-red-400/70 dark:text-red-400">{d.removed}</del>
      ) : null}
      {d.added ? (
        <ins className="bg-emerald-500/12 text-emerald-700 no-underline dark:text-emerald-400">
          {d.added}
        </ins>
      ) : null}
      <span className="text-[var(--ink-soft)]">{d.suffix}</span>
    </p>
  );
}

export function ReviewCard({
  item,
  category,
  active,
  onActivate,
  onAccept,
  onIgnore,
  onAck,
}: {
  item: ReviewItemView;
  /** 结果里带的分类（服务端给的，可能找不到——那就不画色点） */
  category: ReviewCategory | undefined;
  active: boolean;
  onActivate: () => void;
  onAccept: () => void;
  onIgnore: () => void;
  onAck: () => void;
}) {
  // 已处理的缩成一行，只留个交代，别再占着版面
  if (item.status === "accepted" || item.status === "acked") {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-[var(--hairline-soft)] px-2.5 py-1.5 text-[11px] text-[var(--ink-faint)] opacity-70">
        {item.status === "accepted" ? (
          <>
            <Check size={12} className="shrink-0 text-emerald-600" />
            <span className="shrink-0">已采纳</span>
          </>
        ) : (
          <span className="shrink-0">已知道</span>
        )}
        <span className="min-w-0 truncate">{item.suggestion ?? item.quote}</span>
      </div>
    );
  }

  const stale = item.status === "stale";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className={`cursor-pointer rounded-lg border px-2.5 py-2 text-left transition-colors ${
        stale
          ? "border-[var(--hairline-soft)] opacity-60"
          : active
            ? "border-[var(--accent)] bg-[var(--accent-wash)] shadow-[0_2px_10px_rgba(0,0,0,0.06)]"
            : "border-[var(--hairline)] bg-[var(--panel)] hover:border-[var(--accent)]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {category ? (
          <span
            className="shrink-0 rounded px-1.5 py-[1px] text-[10px]"
            style={
              stale
                ? undefined
                : { background: tint(category.color, 0.14), color: category.color }
            }
          >
            {category.label}
          </span>
        ) : null}
        {stale ? (
          <span className="rounded bg-[var(--paper)] px-1 text-[10px] text-[var(--ink-faint)]">
            原文已修改
          </span>
        ) : null}
      </div>

      {/* 先摆出说的是哪一句：不能让人在正文里来回找 */}
      <p className="mt-1.5 line-clamp-2 border-l-2 border-[var(--hairline-strong)] pl-2 text-[11px] leading-relaxed text-[var(--ink-faint)]">
        {item.quote}
      </p>

      <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ink)]">{item.problem}</p>

      {item.suggestion && !stale ? (
        <>
          <p className="mt-1.5 text-[10px] tracking-[0.08em] text-[var(--ink-faint)]">建议改为</p>
          <SuggestionDiff quote={item.quote} suggestion={item.suggestion} />
        </>
      ) : null}

      {stale ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--ink-faint)]">
          <Undo2 size={12} className="shrink-0" />
          这句已经不在正文里了，撤销回去它会自己回来
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {item.suggestion ? (
            <button
              className={`${actionBtn} bg-[var(--accent)] text-white hover:opacity-90`}
              onClick={onAccept}
              title="把原文替换成建议（⌘Z 可撤销）"
            >
              采纳
            </button>
          ) : (
            <button
              className={`${actionBtn} border border-[var(--hairline)] text-[var(--ink-soft)] hover:bg-[var(--paper)]`}
              onClick={onAck}
            >
              知道了
            </button>
          )}
          <button
            className={`${actionBtn} text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)]`}
            onClick={onIgnore}
          >
            忽略
          </button>
        </div>
      )}
    </div>
  );
}
