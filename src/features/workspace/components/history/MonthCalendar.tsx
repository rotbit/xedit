"use client";

/**
 * 历史页左栏：月份标题 + 翻月、月历。
 * 每个日格先列当天做完的事、再列还没做完的待办（合计最多三行），点日格在右栏看明细；
 * 今天之后有安排的日子也能点，月份也能往后翻到最远有安排的那个月。
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

/** 每格最多几行任务：再多就把最后一行换成 +N */
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
  // 本地日志只留 60 天：翻到最早有记录的那个月为止，没有记录就只看本月
  const earliest = earliestLogMonth() ?? current;
  // 往后翻到最远有安排的那个月为止：下个月排了事也要看得到
  let latest = current;
  for (const k of pending.keys()) if (k.slice(0, 7) > latest) latest = k.slice(0, 7);
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
  // 先做完的（ink-soft）再没做完的（ink-faint），合计超过三条时第三行换成 +N：N 是没列出来的条数
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
