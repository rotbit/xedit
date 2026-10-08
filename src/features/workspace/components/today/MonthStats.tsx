"use client";

/**
 * 今天页底部的「本月」：四个合计数字 + 一排逐日小柱。
 * 只画不算：统计由 TodayView 每次渲染时现算好传进来（读 31 个本地键很便宜），
 * 这样日志一变、TodayView 重渲染，这里自然跟着更新，不用自己再订阅事件。
 * 不加任何过渡动画：数字和柱高是「此刻的状态」，切天时跳变比缓动更像翻台历。
 */
import { useLocale, useT } from "@/i18n/useT";
import { htmlLang, type Locale } from "@/i18n/locale";
import type { TFn } from "@/i18n/t";
import {
  monthOf,
  type DayStat,
  type MonthStats as Stats,
} from "@/lib/todos/stats";
import { ColumnHead } from "./parts";

/** 日号只在这些天显示：31 列挤在一行，全标上就糊成一片 */
const LABEL_DAYS = new Set([1, 5, 10, 15, 20, 25, 30]);

/** 月名：zh「9月」、en "September"；按年月第一天格式化 */
function monthName(month: string, locale: Locale): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(htmlLang(locale), { month: "long" }).format(
    new Date(y, m - 1, 1),
  );
}

/** 提示里的短日期：同 formatDue 的写法，zh `10/6`、en `Oct 6`，但今天也照写日期不写「今天」 */
function shortDate(key: string, locale: Locale): string {
  const [y, m, d] = key.split("-").map(Number);
  if (locale === "en") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(new Date(y, m - 1, d));
  }
  return `${m}/${d}`;
}

/**
 * 「数字 + 单位」上，「这是什么」在下：单位句子仍整句交给 t()（英文语序、单复数在字典里），
 * 再按 `{n}` 切开，把数字换成大号字——这样数字和单位能各自排版，又不用拆碎文案。
 * 单独一个「3 件」看不出是什么，所以下面补一行小字说明。
 */
function Figure({
  text,
  value,
  label,
  dim,
}: {
  text: string;
  value: string;
  label: string;
  dim: boolean;
}) {
  const [pre, post = ""] = text.split("{n}");
  const unitCls = "text-[12.5px] text-[var(--ink-faint)]";
  return (
    <span className="flex flex-col">
      <span className="whitespace-nowrap leading-none">
        {pre.trim() ? (
          <span className={`mr-1.5 ${unitCls}`}>{pre.trim()}</span>
        ) : null}
        <span
          className={`text-[22px] font-semibold tabular-nums tracking-tight ${dim ? "text-[var(--ink-faint)]" : ""}`}
        >
          {value}
        </span>
        {post.trim() ? (
          <span className={`ml-1.5 ${unitCls}`}>{post.trim()}</span>
        ) : null}
      </span>
      <span className="mt-1.5 text-[11.5px] text-[var(--ink-faint)]">
        {label}
      </span>
    </span>
  );
}

function DayColumn({
  day,
  max,
  isToday,
  selected,
  onPick,
  t,
  locale,
}: {
  day: DayStat;
  max: number;
  isToday: boolean;
  selected: boolean;
  onPick: () => void;
  t: TFn;
  locale: Locale;
}) {
  const date = Number(day.key.slice(8));
  const showLabel = LABEL_DAYS.has(date) || isToday || selected;
  // 有记录但没新增字数（只勾了待办、只删了字）也给一条细柱，表示「这天动过」
  const height =
    day.chars > 0 && max > 0
      ? `${(day.chars / max) * 100}%`
      : day.active
        ? "3px"
        : null;
  const barColor =
    isToday || selected ? "bg-[var(--accent)]" : "bg-[var(--ink-soft)]/70";
  const title = t("{date} · {chars} 字 · 完成 {n} 件", {
    date: shortDate(day.key, locale),
    chars: day.chars.toLocaleString(),
    abs: day.chars,
    n: day.tasks,
  });
  return (
    <button
      type="button"
      className={`group flex min-w-0 flex-1 flex-col items-center ${day.future ? "cursor-default" : "cursor-pointer"}`}
      title={day.future ? undefined : title}
      aria-label={title}
      aria-pressed={selected}
      disabled={day.future}
      onClick={onPick}
    >
      <span className="relative flex h-14 w-full items-end">
        {height && !day.future ? (
          <span
            className={`w-full rounded-[2px] ${barColor} group-hover:opacity-80`}
            style={{ height }}
          />
        ) : (
          <span className="h-px w-full bg-[var(--hairline-soft)]" />
        )}
      </span>
      <span
        className={`mt-1.5 h-[3px] w-[3px] rounded-full ${day.tasks > 0 ? "bg-[var(--seal)]" : "bg-transparent"}`}
      />
      {/* 不显示的日号也占着一行高度，各列底边才对得齐 */}
      <span
        className={`mt-1 h-[15px] text-[10.5px] leading-[15px] tabular-nums ${
          selected ? "font-medium text-[var(--ink)]" : "text-[var(--ink-faint)]"
        }`}
      >
        {showLabel ? date : ""}
      </span>
    </button>
  );
}

export function MonthStats({
  stats,
  dayKey,
  today,
  onPickDay,
}: {
  stats: Stats;
  dayKey: string;
  today: string;
  onPickDay: (key: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const title =
    stats.month === monthOf(today) ? t("本月") : monthName(stats.month, locale);
  const empty =
    stats.chars === 0 &&
    stats.tasks === 0 &&
    stats.created === 0 &&
    stats.activeDays === 0;
  const max = Math.max(0, ...stats.days.map((d) => d.chars));

  return (
    <section className="mt-14">
      <ColumnHead title={title} />
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <Figure
          text={t("{n} 件", { abs: stats.tasks })}
          value={String(stats.tasks)}
          label={t("完成待办")}
          dim={empty}
        />
        <Figure
          text={t("{n} 字", { abs: stats.chars })}
          value={stats.chars.toLocaleString()}
          label={t("新写字数")}
          dim={empty}
        />
        <Figure
          text={t("{n} 篇", { abs: stats.created })}
          value={String(stats.created)}
          label={t("新建的文章")}
          dim={empty}
        />
        <Figure
          text={t("{n} 天", { abs: stats.activeDays })}
          value={String(stats.activeDays)}
          label={t("写作天数")}
          dim={empty}
        />
      </div>
      <div className="mt-5 flex gap-[3px]">
        {stats.days.map((day) => (
          <DayColumn
            key={day.key}
            day={day}
            max={max}
            isToday={day.key === today}
            selected={day.key === dayKey}
            onPick={() => onPickDay(day.key)}
            t={t}
            locale={locale}
          />
        ))}
      </div>
    </section>
  );
}
