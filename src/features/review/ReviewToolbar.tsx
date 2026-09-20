"use client";

// 审核模式的那条横杠：计数 / 上一条下一条 / 重新审核 / 按类型筛选 / 退出审核。
// 正文里的标注配色也挂在这里：这条横杠在审核模式下一直在，
// 挂在它身上，那几条 CSS 的生命周期就跟审核模式严丝合缝。

import { memo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Settings2, Sparkles, X } from "lucide-react";
import { reviewMarkCss } from "./editorMarks";
import { tint } from "./colors";
import { aiKeyOf, useAiConfig } from "./aiConfig";
import { ReviewAiSettings } from "./ReviewAiSettings";
import type { ReviewCategory, ReviewPhase } from "./types";

const navBtn =
  "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent";
const chip =
  "shrink-0 cursor-pointer rounded-full border px-2 py-[1px] text-[11px] transition-colors";

export const ReviewToolbar = memo(function ReviewToolbar({
  phase,
  total,
  handled,
  categories,
  counts,
  filter,
  onFilter,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onRerun,
  onExit,
  summary,
}: {
  phase: ReviewPhase;
  /** 这一趟一共给了几条 */
  total: number;
  /** 其中已处理（采纳 / 忽略 / 知道了）几条 */
  handled: number;
  categories: ReviewCategory[];
  /** 分类 id → 还待处理的条数 */
  counts: Map<string, number>;
  filter: string | null;
  onFilter: (id: string | null) => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  onRerun: () => void;
  onExit: () => void;
  /** 只有摆不下意见栏时才传：总评没地方站，收进这条横杠里 */
  summary?: string;
}) {
  const loading = phase === "loading";
  const [sumOpen, setSumOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [cfg] = useAiConfig();
  // 这一趟是谁给的意见，始终摆在明面上：没填 key 时说清楚是演示数据，
  // 否则用户会把一堆假意见当成模型的判断
  const model = aiKeyOf(cfg) ? cfg.model.split("/").pop()! : "演示数据";

  return (
    <div className="relative flex h-9 shrink-0 items-center gap-2 border-b border-[var(--hairline-soft)] bg-[var(--panel)] px-4 text-[12px] text-[var(--ink-soft)]">
      {/* 标注的配色跟着结果走（分类是服务端给的），所以 CSS 在这里现生成 */}
      <style>{reviewMarkCss(categories)}</style>

      {loading ? (
        <span className="flex items-center gap-1.5 text-[var(--ink-faint)]">
          <Loader2 size={12} className="animate-spin" />
          正在审核…
        </span>
      ) : phase === "error" ? (
        <span className="text-[var(--ink-faint)]">审核没能完成</span>
      ) : (
        <span className="shrink-0 whitespace-nowrap">
          {total} 条建议
          {handled > 0 ? <span className="text-[var(--ink-faint)]"> · 已处理 {handled}</span> : null}
        </span>
      )}

      {/* 摆不下意见栏时总评无处安放，在这儿给它一个可展开的入口 */}
      {summary && phase === "done" ? (
        <button
          className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-[2px] text-[11px] transition-colors hover:bg-[var(--accent-wash)] ${
            sumOpen ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"
          }`}
          onClick={() => setSumOpen((v) => !v)}
        >
          <Sparkles size={11} />
          总评
        </button>
      ) : null}

      {/* 按类型筛：胶囊上的数字是「还待处理」的条数，处理掉一条就少一个 */}
      {phase === "done" && total > 0 ? (
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <button
            className={`${chip} ${
              filter === null
                ? "border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent)]"
                : "border-[var(--hairline)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
            }`}
            onClick={() => onFilter(null)}
          >
            全部
          </button>
          {categories.map((c) => {
            const n = counts.get(c.id) ?? 0;
            if (n === 0 && filter !== c.id) return null; // 这一类没剩下什么可看的就不占地方
            const on = filter === c.id;
            return (
              <button
                key={c.id}
                className={`${chip} ${on ? "" : "border-[var(--hairline)] hover:opacity-80"}`}
                style={
                  on
                    ? { borderColor: c.color, background: tint(c.color, 0.12), color: c.color }
                    : { color: c.color }
                }
                onClick={() => onFilter(on ? null : c.id)}
              >
                {c.label} {n}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        {/* 用的哪个模型：点开换供应商 / 换模型 / 填 key */}
        <button
          data-menu-trigger
          className={`mr-1 flex max-w-[160px] shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-[2px] text-[11px] transition-colors hover:bg-[var(--accent-wash)] ${
            aiOpen ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"
          }`}
          title="选择审核用的模型"
          onClick={() => setAiOpen((v) => !v)}
        >
          <Settings2 size={11} className="shrink-0" />
          <span className="truncate">{model}</span>
        </button>
        <button className={navBtn} title="上一条（⌥↑）" onClick={onPrev} disabled={!canPrev}>
          <ChevronUp size={14} />
        </button>
        <button className={navBtn} title="下一条（⌥↓）" onClick={onNext} disabled={!canNext}>
          <ChevronDown size={14} />
        </button>
        <button className={navBtn} title="重新审核" onClick={onRerun} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
        <button className={navBtn} title="退出审核" onClick={onExit}>
          <X size={14} />
        </button>
      </div>

      {aiOpen ? (
        <ReviewAiSettings onClose={() => setAiOpen(false)} onChanged={onRerun} />
      ) : null}

      {summary && sumOpen ? (
        <p className="absolute left-4 right-4 top-9 z-20 rounded-b-lg border border-t-0 border-[var(--hairline)] bg-[var(--panel)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-soft)] shadow-[0_6px_18px_rgba(0,0,0,0.08)]">
          {summary}
        </p>
      ) : null}
    </div>
  );
});
