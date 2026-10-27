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
import {
  dayDigest,
  doneStreak,
  earliestLogMonth,
  formatMonthTitle,
  mondayOf,
  monthGrid,
  monthKeys,
  shiftMonth,
} from "@/lib/todos/history";
import { eventLabel, itemLabel, rowId } from "../today/parts";
import type { HistorySel } from "./HistoryView";

const navBtn =
  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-[6px] text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--ink-faint)]";

/** Max task lines per cell: beyond that the last line becomes +N */
const MAX_LINES = 3;

/** Heat steps by done count: one item barely tints the cell, a busy day (4+) reads clearly darker */
function heatCls(done: number): string {
  if (done >= 4) return "bg-[var(--today-wash-deep)]";
  if (done >= 2) return "bg-[var(--today-wash)]";
  if (done === 1) return "bg-[var(--today-tint)]";
  return "";
}

/** Line markers: filled teal = done, hollow ring = to do, filled red = overdue; the legend reuses them so they can't drift apart */
const MARK = {
  done: "h-[5px] w-[5px] rounded-full bg-[var(--today)]",
  todo: "h-[4px] w-[4px] rounded-full border border-[var(--hairline-strong)]",
  late: "h-[5px] w-[5px] rounded-full bg-[var(--seal)]",
} as const;
type Mark = keyof typeof MARK;

function Marker({ kind }: { kind: Mark }) {
  return <i aria-hidden className={`block shrink-0 ${MARK[kind]}`} />;
}

const statNum = "[font-family:var(--serif)] text-[20px] font-semibold tabular-nums tracking-tight text-[var(--today)]";

function Stat({ n, label }: { n: number; label: string }) {
  // The label is translated with the number in it ("{n} 件完成"), then split so the number alone gets the serif treatment
  const i = label.indexOf(String(n));
  const rest = i >= 0 ? label.slice(0, i) + label.slice(i + String(n).length) : label;
  return (
    <span className="flex items-baseline gap-1 text-[12.5px] text-[var(--ink-soft)]">
      <b className={statNum}>{n}</b>
      {rest.trim()}
    </span>
  );
}

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
  // Month summary only counts days up to today: future days can't have completions yet
  const doneOn = new Map<string, number>();
  const countOn = (k: string) => {
    let n = doneOn.get(k);
    if (n === undefined) {
      n = k > today ? 0 : dayDigest(k).tasks.length;
      doneOn.set(k, n);
    }
    return n;
  };
  const counts = monthKeys(month)
    .filter((k) => k <= today)
    .map(countOn);
  const doneTotal = counts.reduce((a, b) => a + b, 0);
  const activeDays = counts.filter((n) => n > 0).length;
  // The streak is about "now", so it only makes sense on the current month
  const streak = month === current ? doneStreak(today, countOn) : 0;

  return (
    <section className="min-w-0">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
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
        {doneTotal > 0 ? (
          <div className="flex gap-[22px] pb-1">
            <Stat n={doneTotal} label={t("{n} 件完成", { n: doneTotal, abs: doneTotal })} />
            <Stat n={activeDays} label={t("{n} 天有记录", { n: activeDays, abs: activeDays })} />
            {streak > 0 ? <Stat n={streak} label={t("{n} 天连续", { n: streak, abs: streak })} /> : null}
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {heads.map((h, i) => (
          <div
            key={h}
            className={`pb-1.5 text-[11px] tracking-[.1em] ${
              // Weekend columns recede a step so the working week reads first
              i >= 5 ? "text-[color-mix(in_srgb,var(--ink-faint)_60%,transparent)]" : "text-[var(--ink-faint)]"
            }`}
          >
            {h}
          </div>
        ))}
        {grid.map((row) => (
          <Row key={row.monday} row={row} today={today} sel={sel} pending={pending} onSelect={onSelect} />
        ))}
      </div>
      <Legend />
    </section>
  );
}

function Legend() {
  const t = useT();
  const item = (kind: Mark, label: string) => (
    <span className="inline-flex items-center gap-[5px]">
      <Marker kind={kind} />
      {label}
    </span>
  );
  const sq = "block h-[10px] w-[10px] rounded-[2px]";
  return (
    <div className="mt-3.5 flex items-center gap-4 text-[11px] text-[var(--ink-faint)]">
      {item("done", t("已完成"))}
      {item("todo", t("待办"))}
      {item("late", t("逾期"))}
      <span className="ml-auto inline-flex items-center gap-1">
        {t("少")}
        <i aria-hidden className={`${sq} bg-[var(--today-tint)]`} />
        <i aria-hidden className={`${sq} bg-[var(--today-wash)]`} />
        <i aria-hidden className={`${sq} bg-[var(--today-wash-deep)]`} />
        {t("多")}
      </span>
    </div>
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
        ),
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
  // Completed first, then unfinished; when there are more than three, the third line becomes +N, where N is the number not shown
  const lines: { id: string; label: string; mark: Mark }[] = [
    ...tasks.map((e) => ({
      id: e.id,
      label: eventLabel(e.text ?? "", e.title, t),
      mark: "done" as const,
    })),
    ...pending.map((item) => {
      // Same rule as Today's overdue pill: a range is late only once past its end, a daily task never is
      const last = item.end ?? item.due;
      const late = item.repeat === null && last !== null && last < today;
      return {
        id: `p:${rowId(item)}`,
        label: itemLabel(item, t),
        mark: late ? ("late" as const) : ("todo" as const),
      };
    }),
  ];
  const shown = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES - 1) : lines;
  const more = lines.length - shown.length;
  // Heat only on unselected past/today cells: selection already owns the tint, and future days have nothing done
  const heat = selected || future ? "" : heatCls(tasks.length);
  const bg = selected
    ? "border-[var(--today)] bg-[var(--today-tint)]"
    : `border-transparent ${heat || "hover:bg-[var(--sidebar)]"}`;
  const numCls = future
    ? "text-[var(--ink-faint)]"
    : lines.length === 0 && !isToday
      ? "text-[var(--hairline-strong)]"
      : "text-[var(--ink-soft)]";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-[78px] min-w-0 cursor-pointer flex-col overflow-hidden rounded-[8px] border p-[6px_7px] text-left ${bg}`}
    >
      <span className={`flex h-[13px] items-center text-[13px] leading-none tabular-nums ${numCls}`}>
        {isToday ? (
          // Negative margins keep the 20px circle from pushing the lines down, so today's cell lines up with its row
          <span className="-my-1 -ml-[3px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--today)] font-semibold text-[var(--today-fg)]">
            {dayOfMonth(day)}
          </span>
        ) : (
          dayOfMonth(day)
        )}
      </span>
      {lines.length > 0 ? (
        <span className="mt-px flex w-full min-w-0 flex-col">
          {shown.map((l) => (
            <span
              key={l.id}
              className={`mt-[3px] flex min-w-0 items-center gap-1 text-[11px] leading-[1.5] ${
                l.mark === "done" ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"
              }`}
            >
              <Marker kind={l.mark} />
              <span className="min-w-0 truncate">{l.label}</span>
            </span>
          ))}
          {more > 0 ? (
            <span className="mt-[3px] text-[11px] leading-[1.5] tabular-nums text-[var(--ink-faint)]">+{more}</span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}
