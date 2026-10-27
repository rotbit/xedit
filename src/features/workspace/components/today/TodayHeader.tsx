"use client";

/**
 * Today page heading: the date with today's writing tally under it, and on the right the day's progress ring beside the "Daily note" button.
 * Split out of TodayMain to keep that file about the list; it reads the writing log itself, like the list rows read theirs.
 */
import { NotebookPen } from "lucide-react";
import { useLocale, useT } from "@/i18n/useT";
import { formatDayTitle } from "@/lib/todos/dates";
import { writingToday } from "./doneToday";

const R = 14;
const C = 2 * Math.PI * R;

/**
 * Done / total for today as a small ring + count. Total counts what was checked today (done log) plus what's still open in the list,
 * so the ring only ever fills as you work through the day; with nothing on the day it's hidden instead of showing an empty 0 / 0.
 */
function Progress({ done, total }: { done: number; total: number }) {
  const t = useT();
  if (total === 0) return null;
  const ratio = Math.min(1, done / total);
  return (
    <div className="flex items-center gap-2">
      <svg
        width={34}
        height={34}
        viewBox="0 0 34 34"
        role="img"
        aria-label={`${t("今日完成")} ${done} / ${total}`}
        className="shrink-0"
      >
        <circle cx={17} cy={17} r={R} fill="none" stroke="var(--today-wash)" strokeWidth={3} />
        <circle
          cx={17}
          cy={17}
          r={R}
          fill="none"
          stroke="var(--today)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${ratio * C} ${C}`}
          transform="rotate(-90 17 17)"
        />
      </svg>
      <div aria-hidden className="leading-tight">
        <div className="text-[14px] font-semibold tabular-nums">
          {done} / {total}
        </div>
        <div className="text-[11px] text-[var(--ink-faint)]">{t("今日完成")}</div>
      </div>
    </div>
  );
}

export function TodayHeader({
  today,
  done,
  total,
  onOpenDaily,
}: {
  today: string;
  /** Checked today */
  done: number;
  /** Checked today + still open in the list */
  total: number;
  onOpenDaily: () => void;
}) {
  const t = useT();
  // Pass the context locale explicitly when formatting dates: during SSR module variables are shared across requests and unreliable
  const locale = useLocale();
  const title = formatDayTitle(today, locale);
  // Today's writing total goes under the date: the home page should show "what I did today" at a glance, more useful than filler at the bottom of the list;
  // log changes trigger re-renders via TodayView's signals, so reading fresh on every render is fine
  const wrote = writingToday(today);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[30px] font-semibold leading-[1.15] tracking-tight">{title.main}</h1>
        <div className="mt-1.5 text-[13px] text-[var(--ink-faint)] tabular-nums">
          {title.sub} · {t("今天")}
          {wrote.chars > 0 ? ` · ${t("写了 {n} 字", { n: wrote.chars.toLocaleString(locale), abs: wrote.chars })}` : null}
          {wrote.docs > 0 ? ` · ${t("改了 {n} 篇", { n: wrote.docs, abs: wrote.docs })}` : null}
        </div>
      </div>
      {/* The daily note sits beside the date it's named after: a quiet outlined button, so the page still reads as a task list first */}
      <div className="flex shrink-0 items-center gap-4">
        <Progress done={done} total={total} />
        <button
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--hairline)] px-2.5 text-[12.5px] font-medium text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
          onClick={onOpenDaily}
        >
          <NotebookPen size={14} className="text-[var(--ink-faint)]" />
          {t("今日笔记")}
        </button>
      </div>
    </div>
  );
}
