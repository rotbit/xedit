/**
 * Data for the 「历史已完成」 (Completed history) calendar page: what was done and which articles were written on a day, todos still open on a day,
 * date keys for this week / month / year, and the calendar grid.
 *
 * Completed items come only from the local log (kept 60 days), same as stats.ts: older days read as empty.
 * Open items come from todos in the current library (pendingByDay), unaffected by log retention.
 * read is injectable so tests don't touch localStorage. Character counts are still computed here (for tests and future use), but the UI doesn't show them yet.
 */

import type { Locale } from "@/i18n/locale";
import type { TodoItem } from "./collect";
import { shiftDay } from "./dates";
import { listDayLogKeys, readDayEvents, type DayEvent } from "./events";

type Read = (key: string) => DayEvent[];

export interface DigestDoc {
  docId?: string;
  title?: string;
  /** Net delta for that doc that day, possibly negative (the UI hides negatives but still counts the doc) */
  chars: number;
  /** This doc was created that day */
  created: boolean;
}

export interface DayDigest {
  key: string;
  tasks: DayEvent[];
  docs: DigestDoc[];
  /** Sum of max(0, net) across docs */
  chars: number;
  active: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Date key → local midnight; null if the key is invalid */
function parseKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Merge key for an article: docId if present, otherwise (old records) the title */
const docKey = (e: { docId?: string; title?: string }) => (e.docId ? `id:${e.docId}` : `title:${e.title ?? ""}`);

/** Same item in the same doc checked, unchecked and checked again keeps only the last entry: same rule as doneOn in today/doneToday.ts */
function dedupTasks(events: DayEvent[]): DayEvent[] {
  const last = new Map<string, DayEvent>();
  const tasks = events.filter((e) => e.kind === "task").sort((a, b) => a.ts - b.ts);
  // Map keeps first-insertion order: delete then set so the position reflects the last check time
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
    if (e.title) d.title = e.title; // Keep the latest title
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

/** Monday of the week (weeks start on Monday) */
export function mondayOf(key: string): string {
  const d = parseKey(key);
  if (!d) return key;
  return shiftDay(key, -((d.getDay() + 6) % 7));
}

/** All date keys in a month */
export function monthKeys(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`);
}

/** Shift months: YYYY-MM */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Calendar grid: each row is 7 cells Monday to Sunday, cells outside the month padded with null; monday is that row's Monday key */
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

/** Earliest day with a log; null if there are no logs */
export function earliestLogKey(keys: string[] = listDayLogKeys()): string | null {
  const valid = keys.filter((k) => DAY_KEY.test(k)).sort();
  return valid.length > 0 ? valid[0] : null;
}

/** Earliest month with a log; null if there are no logs */
export function earliestLogMonth(keys: string[] = listDayLogKeys()): string | null {
  return earliestLogKey(keys)?.slice(0, 7) ?? null;
}

/** The three ranges selectable in the right column */
export type HistoryRange = "week" | "month" | "year";

/** Range start: this Monday / the 1st of this month / Jan 1 this year */
export function rangeStart(range: HistoryRange, today: string): string {
  if (range === "week") return mondayOf(today);
  if (range === "month") return `${today.slice(0, 7)}-01`;
  return `${today.slice(0, 4)}-01-01`;
}

/** Range end: this Sunday / the last day of this month / Dec 31 this year */
export function rangeEnd(range: HistoryRange, today: string): string {
  if (range === "week") return shiftDay(mondayOf(today), 6);
  if (range === "month") return monthKeys(today.slice(0, 7)).at(-1)!;
  return `${today.slice(0, 4)}-12-31`;
}

/**
 * Date keys to list in the range (ascending, deduped): days with logs, plus extraKeys (days with open todos, possibly after today).
 * A year can be hundreds of days: filter from existing local log keys rather than reading localStorage day by day.
 */
export function rangeKeys(
  range: HistoryRange,
  today: string,
  logKeys: string[] = listDayLogKeys(),
  extraKeys: Iterable<string> = []
): string[] {
  const start = rangeStart(range, today);
  const end = rangeEnd(range, today);
  const all = new Set([...logKeys, ...extraKeys]);
  return [...all].filter((k) => DAY_KEY.test(k) && k >= start && k <= end).sort();
}

/** Max days a single todo is spread across: keeps an abnormally long range from stalling the loop */
const MAX_SPAN_DAYS = 400;

/**
 * Group open todos by day: each lands on every day from due to end (or just due), keeping items' order within a group.
 * Undated and checked items are excluded; a daily task's due is always today, so it naturally lands only on today.
 */
export function pendingByDay(items: TodoItem[]): Map<string, TodoItem[]> {
  const out = new Map<string, TodoItem[]>();
  // Reuse date math when several tasks cover the same day; the cache lives for this pass only, date rules still go through shiftDay.
  const nextDays = new Map<string, string>();
  const nextDay = (key: string) => {
    const next = nextDays.get(key) ?? shiftDay(key, 1);
    nextDays.set(key, next);
    return next;
  };
  for (const item of items) {
    if (item.checked || !item.due || !DAY_KEY.test(item.due)) continue;
    const last = item.end && DAY_KEY.test(item.end) && item.end > item.due ? item.end : item.due;
    let k = item.due;
    for (let i = 0; i < MAX_SPAN_DAYS && k <= last; i++, k = nextDay(k)) {
      const list = out.get(k);
      if (list) list.push(item);
      else out.set(k, [item]);
    }
  }
  return out;
}

/** Calendar title: zh `2026 年 10 月`, en `October 2026` */
export function formatMonthTitle(month: string, locale: Locale): string {
  const [y, m] = month.split("-").map(Number);
  if (locale === "en") {
    return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" }).format(new Date(y, m - 1, 1));
  }
  return `${y} 年 ${m} 月`; // i18n-ignore Chinese branch; English uses Intl above
}

/** Year title: zh `2026 年`, en `2026` */
export function formatYearTitle(year: string, locale: Locale): string {
  return locale === "en" ? year : `${year} 年`; // i18n-ignore Chinese branch
}

/** Month name (heading for the per-month fold in the year view): zh `10 月`, en `October` */
export function formatMonthName(month: string, locale: Locale): string {
  const [y, m] = month.split("-").map(Number);
  if (locale === "en") return new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(y, m - 1, 1));
  return `${m} 月`; // i18n-ignore Chinese branch
}
