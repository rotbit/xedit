"use client";

// The review mode bar: count / previous-next / re-review / filter by type / exit review.
// The body's mark colors hang here too: this bar is always present in review mode,
// so attaching them to it ties those CSS rules' lifetime exactly to review mode.

import { memo, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, History, RefreshCw, Settings2, X } from "lucide-react";
import { AiIcon } from "@/components/AiIcon";
import { reviewKindsLabel } from "@/lib/ai/reviewKinds";
import { reviewMarkCss } from "./editorMarks";
import { tint } from "./colors";
import { useAiConfig } from "./aiConfig";
import { ReviewAiSettings } from "./ReviewAiSettings";
import { ReviewSummaryPanel } from "./ReviewSummaryPanel";
import { ReviewHistoryPanel } from "./ReviewHistory";
import { formatRecordTime } from "./history";
import type { ReviewCategory, ReviewPhase, ReviewRecordMeta } from "./types";
import { useT } from "@/i18n/useT";

const navBtn =
  "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent";
const chip =
  "shrink-0 cursor-pointer rounded-full border px-2 py-[1px] text-[11px] transition-colors";

/**
 * Seconds this run has taken. Thinking models take half a minute or more per review; a spinner alone can't tell working from stuck,
 * a ticking counter is reassuring.
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
  docId,
  record,
  fromHistory,
  onOpenRecord,
}: {
  phase: ReviewPhase;
  /** The server's message on error: show it on the bar so users don't just see "couldn't finish" */
  error: string | null;
  /** Total comments in this run */
  total: number;
  /** How many have been handled (accepted / ignored / acknowledged) */
  handled: number;
  categories: ReviewCategory[];
  /** Category id → number still pending */
  counts: Map<string, number>;
  filter: string | null;
  onFilter: (id: string | null) => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  onRerun: () => void;
  onExit: () => void;
  /** Full summary text: clicking 「总评」 (Summary) drops a reading panel below this bar */
  summary?: string;
  /** Panel open state is lifted out: the summary card in the comment column must be able to open it too */
  summaryOpen: boolean;
  onSummaryOpen: (open: boolean) => void;
  /** Settings panel open state is lifted out: the "go to settings" action when the comment column errors must open it too */
  settingsOpen: boolean;
  onSettingsOpen: (open: boolean) => void;
  /** Review history is filed per document */
  docId: string;
  /** The history record of the result currently shown */
  record: ReviewRecordMeta | null;
  /** The current result was opened from history (not freshly run): the bar must say so, so it isn't mistaken for new comments */
  fromHistory: boolean;
  onOpenRecord: (id: string) => void;
}) {
  const t = useT();
  const [historyOpen, setHistoryOpen] = useState(false);
  const loading = phase === "loading";
  const elapsed = useElapsedSeconds(loading);
  // Collapse the summary panel on rerun: it's the previous run's summary and shouldn't pop open again when new results arrive
  const rerun = () => {
    onSummaryOpen(false);
    onRerun();
  };
  const [cfg] = useAiConfig();
  // Always show which types this run reviewed (the backend decides the model, so it isn't shown here).
  // When viewing history, show the types reviewed back then, not the ones currently checked
  const kind = reviewKindsLabel(fromHistory && record ? record.kinds : cfg.kinds, t);

  return (
    <div className="@container relative flex h-9 shrink-0 items-center gap-2 border-b border-[var(--hairline-soft)] bg-[var(--panel)] px-4 text-[12px] text-[var(--ink-soft)]">
      {/* Mark colors follow the result (categories come from the server), so the CSS is generated here */}
      <style>{reviewMarkCss(categories)}</style>

      {loading ? (
        <span className="flex min-w-0 items-center gap-1.5 text-[var(--ink)]" role="status">
          <AiIcon size={14} className="review-breathe shrink-0 text-[var(--accent)]" />
          <span className="truncate font-medium">
            {fromHistory ? t("正在翻出这条审核记录…") : t("AI 正在通读全文，做{kind}…", { kind })}
          </span>
          {fromHistory ? null : (
            <span className="shrink-0 tabular-nums text-[var(--ink-faint)]">
              {t("{n} 秒", { n: elapsed })}
              {elapsed >= 8 ? ` · ${t("一般要半分钟到一分钟")}` : ""}
            </span>
          )}
        </span>
      ) : phase === "error" ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[var(--ink-faint)]">{error ? t(error) : t("审核没能完成")}</span>
          <button
            data-menu-trigger
            className="shrink-0 cursor-pointer whitespace-nowrap text-[var(--accent)] hover:underline"
            onClick={() => onSettingsOpen(true)}
          >
            {t("换审核类型")}
          </button>
        </span>
      ) : (
        <span
          className="shrink-0 whitespace-nowrap"
          title={fromHistory && record ? t("{time} 的记录", { time: formatRecordTime(record.createdAt) }) : undefined}
        >
          {t("{n} 条建议", { n: total })}
          {handled > 0 ? <span className="text-[var(--ink-faint)]"> · {t("已处理 {n}", { n: handled })}</span> : null}
          {fromHistory && record ? (
            <span className="hidden text-[var(--ink-faint)] @5xl:inline"> · {t("{time} 的记录", { time: formatRecordTime(record.createdAt) })}</span>
          ) : null}
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
          <AiIcon size={14} />
          {t("总评")}
        </button>
      ) : null}

      {/* Filter by type: the number on each pill is the pending count, dropping by one as each is handled */}
      {phase === "done" && total > 0 ? (
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pr-4 [mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)] [scrollbar-width:none]">
          <button
            className={`${chip} ${
              filter === null
                ? "border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent)]"
                : "border-[var(--hairline)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
            }`}
            onClick={() => onFilter(null)}
          >
            {t("全部")}
          </button>
          {categories.map((c) => {
            const n = counts.get(c.id) ?? 0;
            if (n === 0 && filter !== c.id) return null; // Don't take up space when nothing is left to see in this category
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
        {/* Which types were reviewed: click to change review type */}
        <button
          data-menu-trigger
          className={`mr-1 flex max-w-[260px] shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-[2px] text-[11px] transition-colors hover:bg-[var(--accent-wash)] ${
            settingsOpen ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"
          }`}
          title={`${t("审核类型")}：${kind}`}
          onClick={() => onSettingsOpen(!settingsOpen)}
        >
          <Settings2 size={12} className="shrink-0" />
          <span className="hidden truncate @4xl:inline">{kind}</span>
        </button>
        <button className={navBtn} title={t("上一条（⌥↑）")} onClick={onPrev} disabled={!canPrev}>
          <ChevronUp size={14} />
        </button>
        <button className={navBtn} title={t("下一条（⌥↓）")} onClick={onNext} disabled={!canNext}>
          <ChevronDown size={14} />
        </button>
        <button
          data-menu-trigger
          className={`${navBtn} ${historyOpen ? "bg-[var(--accent-wash)] text-[var(--ink)]" : fromHistory ? "text-[var(--accent)]" : ""}`}
          title={t("审核历史")}
          onClick={() => setHistoryOpen((v) => !v)}
        >
          <History size={14} />
        </button>
        <button className={navBtn} title={t("重新审核")} onClick={rerun} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
        <button className={navBtn} title={t("退出审核")} onClick={onExit}>
          <X size={14} />
        </button>
      </div>

      {settingsOpen ? (
        <ReviewAiSettings onClose={() => onSettingsOpen(false)} onRerun={rerun} />
      ) : null}

      {historyOpen ? (
        <ReviewHistoryPanel
          docId={docId}
          currentId={record?.id ?? null}
          onOpen={(id) => {
            onSummaryOpen(false);
            onOpenRecord(id);
          }}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {summary && summaryOpen && phase === "done" ? (
        <ReviewSummaryPanel text={summary} onClose={() => onSummaryOpen(false)} />
      ) : null}

      {/* Review in progress: a thin flowing light along the bottom edge */}
      {loading ? <span className="review-progress" aria-hidden /> : null}
    </div>
  );
});
