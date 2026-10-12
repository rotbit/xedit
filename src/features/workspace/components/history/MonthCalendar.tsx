"use client";

/**
 * 历史页左栏：月份标题 + 翻月、月历。
 * 每个日格列出当天做完的事（最多三行），点日格在右栏看明细。
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useT } from "@/i18n/useT";
import { dayOfMonth, formatWeekday, shiftDay } from "@/lib/todos/dates";
import { dayDigest, earliestLogMonth, formatMonthTitle, mondayOf, monthGrid, shiftMonth } from "@/lib/todos/history";
import { eventLabel } from "../today/parts";
import type { HistorySel } from "./HistoryView";

const navBtn =
  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-[6px] text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--ink-faint)]";

/** 每格最多几行任务：再多就把最后一行换成 +N */
const MAX_LINES = 3;

export function MonthCalendar({
  month,
  today,
  sel,
  onMonth,
  onSelect,
}: {
  month: string;
  today: string;
  sel: HistorySel;
  onMonth: (month: string) => void;
  onSelect: (sel: HistorySel) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const current = today.slice(0, 7);
  // 本地日志只留 60 天：翻到最早有记录的那个月为止，没有记录就只看本月
  const earliest = earliestLogMonth() ?? current;
  const grid = monthGrid(month);
  const mon = mondayOf(today);
  // zh 表头只要「一 二 三」，去掉 formatWeekday 的「周」字；en 用 Intl 短名
  const heads = Array.from({ length: 7 }, (_, i) => {
    const w = formatWeekday(shiftDay(mon, i), locale);
    return locale === "en" ? w : w.replace("周", ""); // i18n-ignore 去前缀
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
          disabled={month >= current}
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
          <Row key={row.monday} row={row} today={today} sel={sel} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function Row({
  row,
  today,
  sel,
  onSelect,
}: {
  row: { monday: string; days: (string | null)[] };
  today: string;
  sel: HistorySel;
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
  selected,
  onClick,
}: {
  day: string;
  today: string;
  selected: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const future = day > today;
  const isToday = day === today;
  const tasks = future ? [] : dayDigest(day).tasks;
  // 超过三条时第三行换成 +N：N 是没列出来的条数
  const shown = tasks.length > MAX_LINES ? tasks.slice(0, MAX_LINES - 1) : tasks;
  const more = tasks.length - shown.length;
  return (
    <button
      type="button"
      disabled={future}
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-[76px] min-w-0 flex-col rounded-[7px] border p-1.5 text-left ${
        selected
          ? "border-[var(--ink)]"
          : future
            ? "border-transparent"
            : "cursor-pointer border-transparent hover:border-[var(--hairline-strong)]"
      } ${future ? "cursor-default" : ""}`}
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
      {tasks.length > 0 ? (
        <span className="mt-[3px] flex w-full min-w-0 flex-col">
          {shown.map((e) => (
            <span key={e.id} className="truncate text-[11px] leading-[1.45] text-[var(--ink-soft)]">
              {eventLabel(e.text ?? "", e.title, t)}
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
