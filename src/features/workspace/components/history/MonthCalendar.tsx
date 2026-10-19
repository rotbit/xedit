"use client";

/**
 * History page left column: month title + month navigation, and the calendar.
 * Each day cell lists that day's completed items, then unfinished todos (up to three lines total); clicking a cell shows details on the right.
 * Upcoming scheduled days are clickable too, and you can page forward to the furthest month with something scheduled.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TodoItem } from "@/lib/todos/collect";
import { useLocale, useT } from "@/i18n/useT";
import { dayOfMonth, formatWeekday, shiftDay } from "@/lib/todos/dates";
import { dayDigest, earliestLogMonth, formatMonthTitle, mondayOf, monthGrid, shiftMonth } from "@/lib/todos/history";
import { eventLabel, itemLabel, rowId } from "../today/parts";
import type { HistorySel } from "./HistoryView";

const navBtn =
  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-[6px] text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--ink-faint)]";

/** Max task lines per cell: beyond that the last line becomes +N */
const MAX_LINES = 3;

export function MonthCalendar({
  month,
  today,
  sel,
  pending,
  onMonth,
  onSelect,
}: {
  month: string;
  today: string;
  sel: HistorySel;
  pending: Map<string, TodoItem[]>;
  onMonth: (month: string) => void;
  onSelect: (sel: HistorySel) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const current = today.slice(0, 7);
  // Local logs only keep 60 days: page back as far as the earliest month with records; with no records, only this month
  const earliest = earliestLogMonth() ?? current;
  // Page forward as far as the furthest month with something scheduled: things planned next month should be visible too
  let latest = current;
  for (const k of pending.keys()) if (k.slice(0, 7) > latest) latest = k.slice(0, 7);
  const grid = monthGrid(month);
  const mon = mondayOf(today);
  // zh headers only need 「一 二 三」, so drop the 「周」 from formatWeekday; en uses Intl short names
  const heads = Array.from({ length: 7 }, (_, i) => {
    const w = formatWeekday(shiftDay(mon, i), locale);
    return locale === "en" ? w : w.replace("周", ""); // i18n-ignore strip the prefix
  });

  return (
    <section className="min-w-0">
      <div className="mb-[22px] flex items-center gap-2">
        <button
          type="button"
          className={navBtn}
          aria-label={t("上个月")}
          disabled={month <= earliest}
          onClick={() => onMonth(shiftMonth(month, -1))}
        >
          <ChevronLeft size={16} />
        </button>
        <h1 className="text-[30px] font-semibold leading-[1.15] tracking-tight tabular-nums">
          {formatMonthTitle(month, locale)}
        </h1>
        <button
          type="button"
          className={navBtn}
          aria-label={t("下个月")}
          disabled={month >= latest}
          onClick={() => onMonth(shiftMonth(month, 1))}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {heads.map((h) => (
          <div key={h} className="pb-1 text-[11px] tracking-[.1em] text-[var(--ink-faint)]">
            {h}
          </div>
        ))}
        {grid.map((row) => (
          <Row key={row.monday} row={row} today={today} sel={sel} pending={pending} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function Row({
  row,
  today,
  sel,
  pending,
  onSelect,
}: {
  row: { monday: string; days: (string | null)[] };
  today: string;
  sel: HistorySel;
  pending: Map<string, TodoItem[]>;
  onSelect: (sel: HistorySel) => void;
}) {
  return (
    <>
      {row.days.map((key, i) =>
        key === null ? (
          <div key={`pad-${row.monday}-${i}`} aria-hidden className="pointer-events-none opacity-0" />
        ) : (
          <DayCell
            key={key}
            day={key}
            today={today}
            pending={pending.get(key) ?? []}
            selected={sel.kind === "day" && sel.key === key}
            onClick={() => onSelect({ kind: "day", key })}
          />
        )
      )}
    </>
  );
}

function DayCell({
  day,
  today,
  pending,
  selected,
  onClick,
}: {
  day: string;
  today: string;
  pending: TodoItem[];
  selected: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const future = day > today;
  const isToday = day === today;
  const tasks = future ? [] : dayDigest(day).tasks;
  // Completed (ink-soft) first, then unfinished (ink-faint); when there are more than three, the third line becomes +N, where N is the number not shown
  const lines = [
    ...tasks.map((e) => ({ id: e.id, label: eventLabel(e.text ?? "", e.title, t), done: true })),
    ...pending.map((item) => ({ id: `p:${rowId(item)}`, label: itemLabel(item, t), done: false })),
  ];
  const shown = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES - 1) : lines;
  const more = lines.length - shown.length;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-[76px] min-w-0 cursor-pointer flex-col rounded-[7px] border p-1.5 text-left ${
        selected ? "border-[var(--ink)]" : "border-transparent hover:border-[var(--hairline-strong)]"
      }`}
    >
      <span
        className={`flex items-center gap-1 text-[13px] leading-none tabular-nums ${
          future
            ? "text-[var(--ink-faint)]"
            : isToday
              ? "font-semibold text-[var(--ink)]"
              : "text-[var(--ink-soft)]"
        }`}
      >
        {dayOfMonth(day)}
        {isToday ? <span aria-hidden className="h-[5px] w-[5px] rounded-full bg-[var(--seal)]" /> : null}
      </span>
      {lines.length > 0 ? (
        <span className="mt-[3px] flex w-full min-w-0 flex-col">
          {shown.map((l) => (
            <span
              key={l.id}
              className={`truncate text-[11px] leading-[1.45] ${l.done ? "text-[var(--ink-soft)]" : "text-[var(--ink-faint)]"}`}
            >
              {l.label}
            </span>
          ))}
          {more > 0 ? (
            <span className="text-[11px] leading-[1.45] tabular-nums text-[var(--ink-faint)]">+{more}</span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}
