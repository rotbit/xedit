"use client";

/**
 * History page right column: a row at the top switches between this week / month / year, with details for the selected day or range below.
 * Each day lists unfinished todos due that day (or whose time span covers it) first, then completed items (those checked off on the 「今天」 (Today) page),
 * in the same order as Today (a single day sits on a card with completed first, see DayCard); ranges are grouped by day, and this week includes upcoming scheduled days. Written documents aren't listed here.
 * This year is folded by month, showing just month and count; a month's day-grouped details render only when it's expanded.
 */
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Locale } from "@/i18n/locale";
import { tk, type TFn } from "@/i18n/t";
import { useLocale, useT } from "@/i18n/useT";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { collectTodos, type TodoItem } from "@/lib/todos/collect";
import { formatDayTitle, formatMonthDay, formatWeekday, relativeDayLabel, shiftDay } from "@/lib/todos/dates";
import { KEEP_DAYS, listDayLogKeys } from "@/lib/todos/events";
import {
  dayDigest,
  earliestLogKey,
  formatMonthName,
  formatMonthTitle,
  formatYearTitle,
  rangeKeys,
  rangeStart,
  type HistoryRange,
} from "@/lib/todos/history";
import type { Workspace } from "../../hooks/useWorkspace";
import type { HistorySel } from "./HistoryView";
import { doneOpenId } from "../today/parts";
import { DayCard, DigestRows, Empty, hasRows, type DayRowsData, type DocLookup } from "./rows";

function relLabel(key: string, today: string, t: TFn): string | null {
  const rel = relativeDayLabel(key, today);
  return rel === "today" ? t("今天") : rel === "yesterday" ? t("昨天") : null;
}

function Heading({ main, sub }: { main: string; sub: string }) {
  return (
    <>
      <h2 className="text-[17px] font-semibold leading-snug tabular-nums">{main}</h2>
      <div className="mt-1 text-[12.5px] text-[var(--ink-faint)] tabular-nums">{sub}</div>
    </>
  );
}

const RANGES: { range: HistoryRange; zh: string }[] = [
  { range: "week", zh: tk("本周") },
  { range: "month", zh: tk("本月") },
  { range: "year", zh: tk("本年") },
];

const EMPTY_ZH: Record<HistoryRange, string> = {
  week: tk("这周没有记录"),
  month: tk("这个月没有记录"),
  year: tk("今年没有记录"),
};

/** Range switcher: none of the three is highlighted when a specific day is selected */
function RangeTabs({ sel, onSelect, t }: { sel: HistorySel; onSelect: (sel: HistorySel) => void; t: TFn }) {
  return (
    // Segmented control: outlined frame + solid teal selected item (the history page shares Today's accent), so you can see which range you're on
    <div className="mb-3.5 inline-flex rounded-[7px] border border-[var(--hairline)] bg-[var(--panel)] p-0.5 text-[12.5px]">
      {RANGES.map(({ range, zh }) => {
        const on = sel.kind === "range" && sel.range === range;
        return (
          <button
            key={range}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect({ kind: "range", range })}
            className={`cursor-pointer rounded-[5px] px-3 py-1 leading-none transition-colors ${
              on
                ? "bg-[var(--today)] font-medium text-[var(--today-fg)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
            }`}
          >
            {t(zh)}
          </button>
        );
      })}
    </div>
  );
}

interface GroupCtx {
  dayOf: (key: string) => DayRowsData;
  today: string;
  lookup: DocLookup;
  t: TFn;
  locale: Locale;
}

/** A run of day-grouped details: the order of keys is the display order, empty days are skipped */
function DayGroups({
  keys,
  empty,
  className = "mt-3.5 space-y-5",
  dayOf,
  today,
  lookup,
  t,
  locale,
}: GroupCtx & { keys: string[]; empty?: string; className?: string }) {
  const groups = keys.map(dayOf).filter(hasRows);
  if (groups.length === 0 && !empty) return null;
  return (
    <div className={className}>
      {groups.length === 0 ? <Empty>{empty}</Empty> : null}
      {groups.map((day) => {
        const key = day.d.key;
        const rel = relLabel(key, today, t);
        return (
          <div key={key}>
            <h3 className="flex justify-between border-b border-[var(--hairline-soft)] pb-1.5 text-[11px] tracking-[.14em] tabular-nums text-[var(--ink-faint)]">
              <span>
                {formatWeekday(key, locale)} · {formatMonthDay(key, today, locale)}
              </span>
              {rel ? <span>{rel}</span> : null}
            </h3>
            <DigestRows day={day} today={today} lookup={lookup} t={t} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * This year: folded by month, most recent first. Count = completed + unfinished; completed only reads the digest for keys with logs (up to 60 days),
 * and per-day details only render when a month is expanded.
 */
function YearGroups({
  keys,
  pending,
  openMonths,
  onToggle,
  ...ctx
}: GroupCtx & {
  keys: string[];
  pending: Map<string, TodoItem[]>;
  openMonths: Set<string>;
  onToggle: (month: string) => void;
}) {
  const { t, locale } = ctx;
  const logged = new Set(listDayLogKeys());
  const months = new Map<string, { keys: string[]; count: number }>();
  for (const k of keys) {
    const n = (pending.get(k)?.length ?? 0) + (logged.has(k) ? dayDigest(k).tasks.length : 0);
    if (n === 0) continue;
    const month = k.slice(0, 7);
    const m = months.get(month) ?? { keys: [], count: 0 };
    m.keys.push(k);
    m.count += n;
    months.set(month, m);
  }
  if (months.size === 0) {
    return (
      <div className="mt-3.5">
        <Empty>{t(EMPTY_ZH.year)}</Empty>
      </div>
    );
  }
  const list = [...months.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return (
    <div className="mt-3.5 space-y-2">
      {list.map(([month, { keys: mk, count }]) => {
        const open = openMonths.has(month);
        return (
          <div key={month}>
            <h3>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => onToggle(month)}
                className="flex w-full cursor-pointer items-center justify-between border-b border-[var(--hairline)] py-2 text-left text-[13px] text-[var(--ink)]"
              >
                <span>{formatMonthName(month, locale)}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[12px] tabular-nums text-[var(--ink-faint)]">
                    {t("{n} 件", { n: count, abs: count })}
                  </span>
                  <ChevronRight
                    size={14}
                    aria-hidden
                    className={`text-[var(--ink-faint)] transition-transform ${open ? "rotate-90" : ""}`}
                  />
                </span>
              </button>
            </h3>
            {open ? (
              <div className="pl-3">
                <DayGroups keys={[...mk].reverse()} className="mt-3 space-y-5" {...ctx} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function HistoryDetail({
  ws,
  today,
  sel,
  pending,
  onSelect,
}: {
  ws: Workspace;
  today: string;
  sel: HistorySel;
  pending: Map<string, TodoItem[]>;
  onSelect: (sel: HistorySel) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const toggleMonth = (month: string) =>
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  const { library, nav } = ws;
  const docs = library.docs ?? [];
  const visible = new Set(docs.map((d) => d.id));
  const titles = new Map(docs.map((d) => [d.id, d.title || t(UNTITLED_DOC)]));
  // Every todo in the library, checked ones included: a done record is matched back to its line to find the article it's about (parse results are cached per doc)
  const items = collectTodos(library.allDocs ?? [], today);
  const lookup: DocLookup = {
    titles,
    // What's in the full library but not the visible list is the todo list document (deliberately hidden)
    notesIds: new Set((library.allDocs ?? []).filter((d) => !visible.has(d.id)).map((d) => d.id)),
    open: nav.openDoc,
    openIdOf: (e) => doneOpenId(e, items, (id) => titles.get(id) ?? null),
  };
  const tabs = <RangeTabs sel={sel} onSelect={onSelect} t={t} />;
  const dayOf = (key: string): DayRowsData => ({ d: dayDigest(key), pending: pending.get(key) ?? [] });

  if (sel.kind === "day") {
    const day = dayOf(sel.key);
    const title = formatDayTitle(sel.key, locale);
    const rel = relLabel(sel.key, today, t);
    const done = day.d.tasks.length;
    const total = done + day.pending.length;
    return (
      <section className="min-w-0">
        {tabs}
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <Heading main={title.main} sub={rel ? `${title.sub} · ${rel}` : title.sub} />
          </div>
          {total > 0 ? (
            <span className="shrink-0 rounded-full bg-[var(--today-wash)] px-[7px] text-[11px] leading-[18px] tabular-nums text-[var(--today)]">
              {t("{done} / {total} 完成", { done, total })}
            </span>
          ) : null}
        </div>
        <DayCard day={day} today={today} lookup={lookup} t={t} empty={t("这天没有记录")} />
      </section>
    );
  }

  const { range } = sel;
  const start = rangeStart(range, today);
  let main: string;
  let sub: string;
  if (range === "week") {
    main = `${formatDayTitle(start, locale).main} – ${formatDayTitle(shiftDay(start, 6), locale).main}`;
    sub = t("本周 · 周一到周日");
  } else {
    main = range === "month" ? formatMonthTitle(today.slice(0, 7), locale) : formatYearTitle(today.slice(0, 4), locale);
    sub = range === "month" ? t("本月") : t("本年");
    // Local logs only keep the last KEEP_DAYS days: if the range starts before the earliest log, earlier days just weren't kept, not that nothing was done
    const earliest = earliestLogKey();
    if (earliest && start < earliest) sub += ` · ${t("只有最近 {n} 天的记录", { n: KEEP_DAYS, abs: KEEP_DAYS })}`;
  }
  // This week reads Monday to Sunday in order; month / year are long, so most recent first, no scrolling to the bottom to see the latest days
  const keys = rangeKeys(range, today, undefined, pending.keys());
  const common = { dayOf, today, lookup, t, locale };

  return (
    <section className="min-w-0">
      {tabs}
      <Heading main={main} sub={sub} />
      {range === "year" ? (
        <YearGroups keys={keys} pending={pending} openMonths={openMonths} onToggle={toggleMonth} {...common} />
      ) : (
        <DayGroups keys={range === "week" ? keys : keys.reverse()} empty={t(EMPTY_ZH[range])} {...common} />
      )}
    </section>
  );
}
