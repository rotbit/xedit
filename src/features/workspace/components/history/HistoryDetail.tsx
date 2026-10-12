"use client";

/**
 * 历史页右栏：顶部一行切换本周 / 本月 / 本年，下面是选中那一天或那个范围的明细。
 * 每天先列到期（或时间段覆盖那天）还没做完的待办，再列做完的事（「今天」页里勾掉的那些），
 * 上下顺序同今天页；一个范围时按天分组，本周含今天之后有安排的日子。写过的文章不在这里列。
 * 本年先按月折叠，只列月份与件数；点开某个月才渲染那个月按天分组的明细。
 */
import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import type { Locale } from "@/i18n/locale";
import { tk, type TFn } from "@/i18n/t";
import { useLocale, useT } from "@/i18n/useT";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import type { TodoItem } from "@/lib/todos/collect";
import { formatDayTitle, formatMonthDay, formatWeekday, relativeDayLabel, shiftDay } from "@/lib/todos/dates";
import { KEEP_DAYS, listDayLogKeys, type DayEvent } from "@/lib/todos/events";
import {
  dayDigest,
  earliestLogKey,
  formatMonthName,
  formatMonthTitle,
  formatYearTitle,
  rangeKeys,
  rangeStart,
  type DayDigest,
  type HistoryRange,
} from "@/lib/todos/history";
import { NOTES_TITLE } from "@/lib/todos/write";
import type { Workspace } from "../../hooks/useWorkspace";
import { eventLabel, itemLabel, linkedDoc, rowId, TodoBox } from "../today/parts";
import type { HistorySel } from "./HistoryView";

const rowCls = "flex items-start gap-2.5 px-0.5 py-[7px] text-[13.5px] leading-[1.45]";

/** 文章的显示与跳转：文库里还在就用现名、可点；已删的用记录里的标题、不可点 */
export interface DocLookup {
  /** 可见文章 id → 现名 */
  titles: Map<string, string>;
  /** 待办清单那篇（对用户隐形）的 id：任务行不再注明出处 */
  notesIds: Set<string>;
  open: (id: string) => void;
}

function relLabel(key: string, today: string, t: TFn): string | null {
  const rel = relativeDayLabel(key, today);
  return rel === "today" ? t("今天") : rel === "yesterday" ? t("昨天") : null;
}

function TaskRow({ e, lookup, t }: { e: DayEvent; lookup: DocLookup; t: TFn }) {
  const label = eventLabel(e.text ?? "", e.title, t);
  // 出处：清单那篇对用户隐形、发布排期的文字里已带标题，这两种不注；其余用现名，已删的用记录里的标题
  const fromNotes = (e.docId !== undefined && lookup.notesIds.has(e.docId)) || e.title === NOTES_TITLE;
  const isPublish = e.title !== undefined && e.text === `发布《${e.title}》`; // i18n-ignore 比对数据原文
  const source =
    e.title && !fromNotes && !isPublish ? ((e.docId && lookup.titles.get(e.docId)) ?? e.title) : null;
  return (
    <div className={rowCls}>
      <Check size={14} className="mt-[3px] shrink-0 text-[var(--ink-faint)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <div>{label}</div>
        {source ? (
          <div className="mt-px truncate text-[12.5px] text-[var(--ink-faint)]">{t("《{title}》", { title: source })}</div>
        ) : null}
      </div>
    </div>
  );
}

/** 没做完的待办：只读展示；那天早于今天的标逾期 */
function PendingRow({ item, overdue, lookup, t }: { item: TodoItem; overdue: boolean; lookup: DocLookup; t: TFn }) {
  const label = itemLabel(item, t);
  const linked = linkedDoc(item, (id) => lookup.titles.get(id) ?? null);
  // 出处：正文里的注那篇；清单里的有关联文章才注；发布排期文字里已带标题，不注
  const source = item.source === "doc" ? item.docTitle : (linked?.title ?? null);
  // 点文字去哪：正文里的、发布排期回那篇；清单里的那篇对用户隐形，关联了文章才可点
  const openId = item.source === "notes" ? (linked?.id ?? null) : item.docId;
  return (
    <div className={rowCls}>
      <TodoBox done={false} />
      <div className="min-w-0 flex-1">
        {openId ? (
          <button
            type="button"
            className="cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-soft)]"
            onClick={() => lookup.open(openId)}
          >
            {label}
          </button>
        ) : (
          <div>{label}</div>
        )}
        {source ? (
          <div className="mt-px truncate text-[12.5px] text-[var(--ink-faint)]">{t("《{title}》", { title: source })}</div>
        ) : null}
      </div>
      {overdue ? (
        <span className="ml-1 mt-[3px] shrink-0 rounded-[4px] bg-[var(--seal-wash)] px-1.5 py-px text-[11px] text-[var(--seal)]">
          {t("逾期")}
        </span>
      ) : null}
    </div>
  );
}

/** 一天的明细：没做完的在前、做完的在后，同今天页上下顺序 */
interface DayRowsData {
  d: DayDigest;
  pending: TodoItem[];
}

function DigestRows({ day, today, lookup, t }: { day: DayRowsData; today: string; lookup: DocLookup; t: TFn }) {
  const overdue = day.d.key < today;
  return (
    <div className="divide-y divide-[var(--hairline-soft)]">
      {day.pending.map((item) => (
        <PendingRow key={`p:${rowId(item)}`} item={item} overdue={overdue} lookup={lookup} t={t} />
      ))}
      {day.d.tasks.map((e) => (
        <TaskRow key={e.id} e={e} lookup={lookup} t={t} />
      ))}
    </div>
  );
}

// 做完的事加上没做完的待办；写了 / 新建了哪些文章不在这里列
const hasRows = (day: DayRowsData) => day.pending.length > 0 || day.d.tasks.length > 0;

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-0.5 py-2 text-[13px] text-[var(--ink-faint)]">{children}</div>;
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

/** 范围切换：选中某一天时三个都不高亮 */
function RangeTabs({ sel, onSelect, t }: { sel: HistorySel; onSelect: (sel: HistorySel) => void; t: TFn }) {
  return (
    // 分段控件：描边外框 + 选中项实心，比一行淡字醒目，一眼看出现在在看哪一段
    <div className="mb-3.5 inline-flex rounded-[7px] border border-[var(--hairline)] p-0.5 text-[12.5px]">
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
                ? "bg-[var(--ink)] font-medium text-[var(--paper)]"
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

/** 按天分组的一串明细：keys 的顺序即显示顺序，没东西的日子跳过 */
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
 * 本年：按月折叠，近的月份在前。件数 = 做完的 + 没做完的；做完的只对有日志的键读 digest（最多 60 天），
 * 按天的明细只在月份展开时才渲染。
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
  const lookup: DocLookup = {
    titles: new Map(docs.map((d) => [d.id, d.title || t(UNTITLED_DOC)])),
    // 全库里有、可见列表里没有的就是待办清单那篇（它被刻意藏起来）
    notesIds: new Set((library.allDocs ?? []).filter((d) => !visible.has(d.id)).map((d) => d.id)),
    open: nav.openDoc,
  };
  const tabs = <RangeTabs sel={sel} onSelect={onSelect} t={t} />;
  const dayOf = (key: string): DayRowsData => ({ d: dayDigest(key), pending: pending.get(key) ?? [] });

  if (sel.kind === "day") {
    const day = dayOf(sel.key);
    const title = formatDayTitle(sel.key, locale);
    const rel = relLabel(sel.key, today, t);
    return (
      <section className="min-w-0">
        {tabs}
        <Heading main={title.main} sub={rel ? `${title.sub} · ${rel}` : title.sub} />
        <div className="mt-3.5">
          {hasRows(day) ? (
            <DigestRows day={day} today={today} lookup={lookup} t={t} />
          ) : (
            <Empty>{t("这天没有记录")}</Empty>
          )}
        </div>
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
    // 本地日志只留最近 KEEP_DAYS 天：范围起点早于最早的日志，就说明前面是没留下，不是没做事
    const earliest = earliestLogKey();
    if (earliest && start < earliest) sub += ` · ${t("只有最近 {n} 天的记录", { n: KEEP_DAYS, abs: KEEP_DAYS })}`;
  }
  // 本周按周一到周日顺着看；本月 / 本年一长串，近的放前面，不用滚到底才见最近几天
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
