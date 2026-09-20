"use client";

// 审核模式的那条横杠：计数 / 上一条下一条 / 重新审核 / 按类型筛选 / 退出审核。
// 正文里的标注配色也挂在这里：这条横杠在审核模式下一直在，
// 挂在它身上，那几条 CSS 的生命周期就跟审核模式严丝合缝。

import { memo, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Settings2, Sparkles, X } from "lucide-react";
import { reviewKindsLabel } from "@/lib/ai/reviewKinds";
import { reviewMarkCss } from "./editorMarks";
import { tint } from "./colors";
import { useAiConfig } from "./aiConfig";
import { ReviewAiSettings } from "./ReviewAiSettings";
import { ReviewSummaryPanel } from "./ReviewSummaryPanel";
import type { ReviewCategory, ReviewPhase } from "./types";

const navBtn =
  "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent";
const chip =
  "shrink-0 cursor-pointer rounded-full border px-2 py-[1px] text-[11px] transition-colors";

/**
 * 这一趟已经跑了几秒。带思考的模型一审就是半分钟起步，光有个转圈看不出是在干活还是卡死了，
 * 秒数在走才让人放心。
 */
export function useElapsedSeconds(running: boolean): number {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const id = setInterval(() => setSec(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => {
      clearInterval(id);
      setSec(0);
    };
  }, [running]);
  return sec;
}

export const ReviewToolbar = memo(function ReviewToolbar({
  phase,
  error,
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
  summaryOpen,
  onSummaryOpen,
  settingsOpen,
  onSettingsOpen,
}: {
  phase: ReviewPhase;
  /** 出错时服务端那句话：摆在横杠上，别让用户只看见「没能完成」 */
  error: string | null;
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
  /** 总评全文：点「总评」在这条横杠底下垂一张阅读面板 */
  summary?: string;
  /** 面板的开合提到外面：意见栏里那张总评小卡也要能把它打开 */
  summaryOpen: boolean;
  onSummaryOpen: (open: boolean) => void;
  /** 设置面板的开合提到外面：意见栏出错时那句「去设置」也要能把它打开 */
  settingsOpen: boolean;
  onSettingsOpen: (open: boolean) => void;
}) {
  const loading = phase === "loading";
  const elapsed = useElapsedSeconds(loading);
  // 重跑时把总评面板收掉：那是上一趟的总评，新结果出来时不该自己又弹开
  const rerun = () => {
    onSummaryOpen(false);
    onRerun();
  };
  const [cfg] = useAiConfig();
  // 这一趟审的是哪一类，始终摆在明面上（用哪个模型由后台定，这里不显示）
  const kind = reviewKindsLabel(cfg.kinds);

  return (
    <div className="relative flex h-9 shrink-0 items-center gap-2 border-b border-[var(--hairline-soft)] bg-[var(--panel)] px-4 text-[12px] text-[var(--ink-soft)]">
      {/* 标注的配色跟着结果走（分类是服务端给的），所以 CSS 在这里现生成 */}
      <style>{reviewMarkCss(categories)}</style>

      {loading ? (
        <span className="flex min-w-0 items-center gap-1.5 text-[var(--ink)]" role="status">
          <Sparkles size={13} className="review-breathe shrink-0 text-[var(--accent)]" />
          <span className="truncate font-medium">AI 正在通读全文，做{kind}…</span>
          <span className="shrink-0 tabular-nums text-[var(--ink-faint)]">
            {elapsed} 秒{elapsed >= 8 ? " · 一般要半分钟到一分钟" : ""}
          </span>
        </span>
      ) : phase === "error" ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[var(--ink-faint)]">{error ?? "审核没能完成"}</span>
          <button
            data-menu-trigger
            className="shrink-0 cursor-pointer whitespace-nowrap text-[var(--accent)] hover:underline"
            onClick={() => onSettingsOpen(true)}
          >
            换审核类型
          </button>
        </span>
      ) : (
        <span className="shrink-0 whitespace-nowrap">
          {total} 条建议
          {handled > 0 ? <span className="text-[var(--ink-faint)]"> · 已处理 {handled}</span> : null}
        </span>
      )}

      {summary && phase === "done" ? (
        <button
          data-menu-trigger
          className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-[2px] text-[11px] transition-colors hover:bg-[var(--accent-wash)] ${
            summaryOpen ? "bg-[var(--accent-wash)] text-[var(--accent)]" : "text-[var(--ink-soft)]"
          }`}
          onClick={() => onSummaryOpen(!summaryOpen)}
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
        {/* 审的哪一类：点开换审核类型 */}
        <button
          data-menu-trigger
          className={`mr-1 flex max-w-[260px] shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-[2px] text-[11px] transition-colors hover:bg-[var(--accent-wash)] ${
            settingsOpen ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"
          }`}
          title="审核类型"
          onClick={() => onSettingsOpen(!settingsOpen)}
        >
          <Settings2 size={11} className="shrink-0" />
          <span className="truncate">{kind}</span>
        </button>
        <button className={navBtn} title="上一条（⌥↑）" onClick={onPrev} disabled={!canPrev}>
          <ChevronUp size={14} />
        </button>
        <button className={navBtn} title="下一条（⌥↓）" onClick={onNext} disabled={!canNext}>
          <ChevronDown size={14} />
        </button>
        <button className={navBtn} title="重新审核" onClick={rerun} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
        <button className={navBtn} title="退出审核" onClick={onExit}>
          <X size={14} />
        </button>
      </div>

      {settingsOpen ? (
        <ReviewAiSettings onClose={() => onSettingsOpen(false)} onRerun={rerun} />
      ) : null}

      {summary && summaryOpen && phase === "done" ? (
        <ReviewSummaryPanel text={summary} onClose={() => onSummaryOpen(false)} />
      ) : null}

      {/* 审核进行中：底边一道流动的细光 */}
      {loading ? <span className="review-progress" aria-hidden /> : null}
    </div>
  );
});
