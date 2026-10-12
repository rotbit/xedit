/**
 * 「历史已完成」月历回顾页的数据：某一天做完的事与写过的文章，本周 / 本月 / 本年的日期键，月历网格。
 *
 * 只读本地日志（只留 60 天），同 stats.ts：更早的日子读到的就是空。
 * read 可注入，测试不必碰 localStorage。字数仍在这里算（测试与将来用），界面暂不展示。
 */

import type { Locale } from "@/i18n/locale";
import { shiftDay } from "./dates";
import { listDayLogKeys, readDayEvents, type DayEvent } from "./events";

type Read = (key: string) => DayEvent[];

export interface DigestDoc {
  docId?: string;
  title?: string;
  /** 该篇当天的净增量，可能为负（界面不显示负数，但篇数照算） */
  chars: number;
  /** 当天新建了这篇 */
  created: boolean;
}

export interface DayDigest {
  key: string;
  tasks: DayEvent[];
  docs: DigestDoc[];
  /** 各篇 max(0, 净值) 之和 */
  chars: number;
  active: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 日期键 → 本地零点；键不合法返回 null */
function parseKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** 文章的合并键：有 docId 用 docId，没有的（老记录）按标题 */
const docKey = (e: { docId?: string; title?: string }) => (e.docId ? `id:${e.docId}` : `title:${e.title ?? ""}`);

/** 同一篇同一句勾了又取消再勾只留最后一条：与 today/doneToday.ts 的 doneOn 同一口径 */
function dedupTasks(events: DayEvent[]): DayEvent[] {
  const last = new Map<string, DayEvent>();
  const tasks = events.filter((e) => e.kind === "task").sort((a, b) => a.ts - b.ts);
  // Map 按首次插入排序：先删再设，顺序才落在最后一次勾选的时间上
  for (const e of tasks) {
    const k = `${e.docId ?? ""}|${e.text ?? ""}`;
    last.delete(k);
    last.set(k, e);
  }
  return [...last.values()];
}

export function dayDigest(key: string, read: Read = readDayEvents): DayDigest {
  const events = read(key);
  const docs = new Map<string, DigestDoc>();
  for (const e of events) {
    if (e.kind !== "write" && e.kind !== "create") continue;
    const k = docKey(e);
    const d = docs.get(k) ?? { docId: e.docId, title: e.title, chars: 0, created: false };
    if (e.title) d.title = e.title; // 以最新的标题为准
    if (e.kind === "write") d.chars += e.chars ?? 0;
    else d.created = true;
    docs.set(k, d);
  }
  const list = [...docs.values()].sort((a, b) => b.chars - a.chars);
  return {
    key,
    tasks: dedupTasks(events),
    docs: list,
    chars: list.reduce((s, d) => s + Math.max(0, d.chars), 0),
    active: events.length > 0,
  };
}

/** 所在周的周一（周一为一周之首） */
export function mondayOf(key: string): string {
  const d = parseKey(key);
  if (!d) return key;
  return shiftDay(key, -((d.getDay() + 6) % 7));
}

/** 某月所有日期键 */
export function monthKeys(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`);
}

/** 月份前后挪：YYYY-MM */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** 月历网格：每行周一到周日 7 格，首尾不属于本月的用 null 补齐；monday 是该行周一的键 */
export function monthGrid(month: string): { monday: string; days: (string | null)[] }[] {
  const keys = monthKeys(month);
  const first = keys[0];
  const lead = (parseKey(first)!.getDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...keys];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: { monday: string; days: (string | null)[] }[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push({ monday: shiftDay(first, i - lead), days: cells.slice(i, i + 7) });
  }
  return rows;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** 最早有日志的那天；没有日志返回 null */
export function earliestLogKey(keys: string[] = listDayLogKeys()): string | null {
  const valid = keys.filter((k) => DAY_KEY.test(k)).sort();
  return valid.length > 0 ? valid[0] : null;
}

/** 最早有日志的月份；没有日志返回 null */
export function earliestLogMonth(keys: string[] = listDayLogKeys()): string | null {
  return earliestLogKey(keys)?.slice(0, 7) ?? null;
}

/** 右栏可选的三个范围 */
export type HistoryRange = "week" | "month" | "year";

/** 范围的起点：本周一 / 本月 1 号 / 今年 1 月 1 日 */
export function rangeStart(range: HistoryRange, today: string): string {
  if (range === "week") return mondayOf(today);
  if (range === "month") return `${today.slice(0, 7)}-01`;
  return `${today.slice(0, 4)}-01-01`;
}

/**
 * 范围内有日志的日期键（升序，不晚于 today）。
 * 本年可能几百天：从本地已有的日志键里筛，不逐天读 localStorage。
 */
export function rangeKeys(range: HistoryRange, today: string, logKeys: string[] = listDayLogKeys()): string[] {
  const start = rangeStart(range, today);
  return logKeys.filter((k) => DAY_KEY.test(k) && k >= start && k <= today).sort();
}

/** 月历标题：zh `2026 年 10 月`，en `October 2026` */
export function formatMonthTitle(month: string, locale: Locale): string {
  const [y, m] = month.split("-").map(Number);
  if (locale === "en") {
    return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" }).format(new Date(y, m - 1, 1));
  }
  return `${y} 年 ${m} 月`; // i18n-ignore 中文分支，英文走上面的 Intl
}

/** 年标题：zh `2026 年`，en `2026` */
export function formatYearTitle(year: string, locale: Locale): string {
  return locale === "en" ? year : `${year} 年`; // i18n-ignore 中文分支
}
