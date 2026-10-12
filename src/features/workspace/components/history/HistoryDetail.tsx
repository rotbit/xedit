"use client";

/**
 * 历史页右栏：顶部一行切换本周 / 本月 / 本年，下面是选中那一天或那个范围的明细。
 * 只列做完的事（「今天」页里勾掉的那些），一个范围时按天分组；写过的文章不在这里列。
 */
import { Check } from "lucide-react";
import { tk, type TFn } from "@/i18n/t";
import { useLocale, useT } from "@/i18n/useT";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { formatDayTitle, formatMonthDay, formatWeekday, relativeDayLabel, shiftDay } from "@/lib/todos/dates";
import { KEEP_DAYS, type DayEvent } from "@/lib/todos/events";
import {
  dayDigest,
  earliestLogKey,
  formatMonthTitle,
  formatYearTitle,
  rangeKeys,
  rangeStart,
  type DayDigest,
  type HistoryRange,
} from "@/lib/todos/history";
import { NOTES_TITLE } from "@/lib/todos/write";
import type { Workspace } from "../../hooks/useWorkspace";
import { eventLabel } from "../today/parts";
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

function DigestRows({ d, lookup, t }: { d: DayDigest; lookup: DocLookup; t: TFn }) {
  return (
    <div className="divide-y divide-[var(--hairline-soft)]">
      {d.tasks.map((e) => (
        <TaskRow key={e.id} e={e} lookup={lookup} t={t} />
      ))}
    </div>
  );
}

// 只看做完的事：写了 / 新建了哪些文章不在这里列（用户要的是「今天」页里勾掉的那些）
const hasRows = (d: DayDigest) => d.tasks.length > 0;

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

export function HistoryDetail({
  ws,
  today,
  sel,
  onSelect,
}: {
  ws: Workspace;
  today: string;
  sel: HistorySel;
  onSelect: (sel: HistorySel) => void;
}) {
  const t = useT();
  const locale = useLocale();
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

  if (sel.kind === "day") {
    const d = dayDigest(sel.key);
    const title = formatDayTitle(sel.key, locale);
    const rel = relLabel(sel.key, today, t);
    return (
      <section className="min-w-0">
        {tabs}
        <Heading main={title.main} sub={rel ? `${title.sub} · ${rel}` : title.sub} />
        <div className="mt-3.5">{hasRows(d) ? <DigestRows d={d} lookup={lookup} t={t} /> : <Empty>{t("这天没有记录")}</Empty>}</div>
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
  const keys = rangeKeys(range, today);
  const groups = (range === "week" ? keys : keys.reverse()).map((k) => dayDigest(k)).filter(hasRows);

  return (
    <section className="min-w-0">
      {tabs}
      <Heading main={main} sub={sub} />
      <div className="mt-3.5 space-y-5">
        {groups.length === 0 ? (
          <Empty>{t(EMPTY_ZH[range])}</Empty>
        ) : (
          groups.map((d) => {
            const rel = relLabel(d.key, today, t);
            return (
              <div key={d.key}>
                <h3 className="flex justify-between border-b border-[var(--hairline-soft)] pb-1.5 text-[11px] tracking-[.14em] tabular-nums text-[var(--ink-faint)]">
                  <span>
                    {formatWeekday(d.key, locale)} · {formatMonthDay(d.key, today, locale)}
                  </span>
                  {rel ? <span>{rel}</span> : null}
                </h3>
                <DigestRows d={d} lookup={lookup} t={t} />
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
