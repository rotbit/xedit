/**
 * Date convention for the Today view: always local-time `YYYY-MM-DD`.
 *
 * No toISOString: it folds back to UTC, so a todo written in the early morning in UTC+8 would land on the previous day
 * (same as dayKey in features/workspace/lib/recencyGroups.ts). Unlike dayKey this zero-pads,
 * because date keys are compared as strings (overdue = due < today), and unpadded "2026-10-9" sorts after "2026-10-10".
 */

import { getLocale, type Locale } from "@/i18n/locale";
import { translate } from "@/i18n/t";

const pad = (n: number) => String(n).padStart(2, "0");

/** Local YYYY-MM-DD (zero-padded month and day) */
export function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: Date = new Date()): string {
  return dayKeyOf(now);
}

/** Date key back to local midnight; null if the key is invalid */
function parseKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Only accept dates that actually exist: Date rolls 2/30 over to 3/2, so it has to be caught */
function makeDate(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** Shift by delta days: let setDate handle month-end, year-end and DST rollover */
export function shiftDay(key: string, delta: number): string {
  const date = parseKey(key);
  if (!date) return key;
  date.setDate(date.getDate() + delta);
  return dayKeyOf(date);
}

/** Difference in days (b - a) by local midnight; rounding smooths over the DST hour */
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Difference in days between two date keys (b - a); 0 if either key is invalid */
export function daysBetween(a: string, b: string): number {
  const da = parseKey(a);
  const db = parseKey(b);
  return da && db ? diffDays(da, db) : 0;
}

/**
 * Year-less `@M/D`: defaults to this year, but if that's more than 180 days before today it's most likely a year-end note about early next year, so use next year.
 * The 180-day window keeps "the past few months" in this year — those are genuinely overdue and must not quietly move to next year.
 */
function inferYear(m: number, d: number, today: Date): Date | null {
  const thisYear = makeDate(today.getFullYear(), m, d);
  if (!thisYear) {
    // If 2/29 doesn't exist this year it probably doesn't next year either; run the fallback anyway
    return makeDate(today.getFullYear() + 1, m, d);
  }
  if (diffDays(thisYear, today) > 180) return makeDate(today.getFullYear() + 1, m, d);
  return thisYear;
}

/**
 * Relative date tag → day offset. Chinese and English tags coexist regardless of UI language:
 * tags live in the article body, one doc may mix both, and switching UI language must not strip dates from existing todos.
 */
// Map rather than an object literal: tags like `@constructor` must not hit prototype properties
const RELATIVE_TAGS = new Map<string, number>([
  ["今天", 0], // i18n-ignore data, not UI copy
  ["明天", 1], // i18n-ignore
  ["昨天", -1], // i18n-ignore
  ["today", 0],
  ["tomorrow", 1],
  ["yesterday", -1],
]);

/** Recognized tag → date key; null if unrecognized (caller keeps the text as-is) */
function resolveTag(tag: string, today: string): string | null {
  const rel = RELATIVE_TAGS.get(tag.toLowerCase());
  if (rel !== undefined) return rel === 0 ? today : shiftDay(today, rel);
  const base = parseKey(today);
  if (!base) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(tag);
  if (m) {
    const date = makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return date ? dayKeyOf(date) : null;
  }
  m = /^(\d{1,2})\/(\d{1,2})$/.exec(tag) ?? /^(\d{1,2})月(\d{1,2})日?$/.exec(tag);
  if (m) {
    const date = inferYear(Number(m[1]), Number(m[2]), base);
    return date ? dayKeyOf(date) : null;
  }
  return null;
}

/**
 * Tag (without @) → start + end date. `a~b` is a range, each side resolved via resolveTag;
 * if end precedes start or either side is unrecognized, the whole tag is rejected (null). end is null for a single date.
 */
function resolveRange(tag: string, today: string): { due: string; end: string | null } | null {
  const i = tag.indexOf("~");
  if (i < 0) {
    const due = resolveTag(tag, today);
    return due ? { due, end: null } : null;
  }
  const due = resolveTag(tag.slice(0, i), today);
  const end = resolveTag(tag.slice(i + 1), today);
  if (!due || !end || end < due) return null;
  return { due, end };
}

/**
 * Daily repeat tag (without @): `每天` / `daily`, optionally with the last completion date `每天:2026-10-10`.
 * The completion date lives in the tag rather than elsewhere: checking it edits only this line, and sync, export and other devices follow the body.
 * If what follows the colon isn't a real zero-padded date the whole tag is rejected (kept as plain text), so a half-typed typo doesn't silently become a daily task.
 * word is the user's own word (每天 / daily, case preserved); rewrites reuse it rather than switching language for them.
 */
export function parseRepeatTag(tag: string): { word: string; last: string | null } | null {
  const m = /^(每天|daily)(?::(.*))?$/i.exec(tag); // i18n-ignore tag data
  if (!m) return null;
  if (m[2] === undefined) return { word: m[1], last: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m[2]) || !parseKey(m[2])) return null;
  return { word: m[1], last: m[2] };
}

/**
 * Whether this `@xxx` (without @) is a tag parseDueTag recognizes (date, `a~b` range, daily repeat);
 * used to decide whether to strip it when changing date / link — repeat and date tags occupy the same end-of-line slot, treated alike
 */
export function isDueTag(tag: string, today: string): boolean {
  return parseRepeatTag(tag) !== null || resolveRange(tag, today) !== null;
}

/**
 * Daily repeat tag at the end of the text (same rules as parseDueTag: one at end of line, preceded by whitespace):
 * split into the preceding text and the tag itself (without @); null if absent. Used when logging a task to decide whether to add a date tag.
 */
export function splitRepeatTag(text: string): { text: string; tag: string } | null {
  const trimmed = text.trimEnd();
  const m = /(^|\s)@(\S+)$/.exec(trimmed);
  if (!m || !parseRepeatTag(m[2])) return null;
  return { text: trimmed.slice(0, m.index).trimEnd(), tag: m[2] };
}

/** Next Monday: the first Monday after today (seven days out if today is Monday) */
export function nextMonday(today: string): string {
  const d = parseKey(today);
  if (!d) return today;
  const ahead = ((8 - d.getDay()) % 7) || 7;
  return shiftDay(today, ahead);
}

/**
 * Strip the date tag at the end of task text. Only one trailing `@xxx` preceded by whitespace counts (or a range `@start~end`):
 * a mid-sentence `@someone` or an email isn't a date and mustn't be eaten; unrecognized `@xxx` stays in the text.
 * end is the range's end date, null for a single date.
 */
export function parseDueTag(
  text: string,
  today: string
): { text: string; due: string | null; end: string | null } {
  const { text: rest, due, end } = parseTaskTag(text, today);
  return { text: rest, due, end };
}

/**
 * Full version of parseDueTag that also reports daily-repeat info. A daily task's due is always today with no end date —
 * it should show in the left column every day, never overdue and never in 「接下来」 (Up next); last is the last completion date stored in the tag.
 */
export function parseTaskTag(
  text: string,
  today: string
): { text: string; due: string | null; end: string | null; repeat: "daily" | null; last: string | null } {
  const trimmed = text.trimEnd();
  const none = { text: trimmed, due: null, end: null, repeat: null, last: null };
  const m = /(^|\s)@(\S+)$/.exec(trimmed);
  if (!m) return none;
  const rep = parseRepeatTag(m[2]);
  const range = rep ? { due: today, end: null } : resolveRange(m[2], today);
  if (!range) return none;
  const rest = trimmed.slice(0, m.index).trimEnd();
  // If the line is only a tag, stripping leaves nothing: keep the original so we don't get a todo with no visible text
  return {
    text: rest || trimmed,
    due: range.due,
    end: range.end,
    repeat: rep ? "daily" : null,
    last: rep ? rep.last : null,
  };
}

/** Intl formatters cached per language: every todo row on the Today page formats once, don't keep new-ing them */
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    fmtCache.set(key, f);
  }
  return f;
}

/**
 * Date column display: today / tomorrow / same year / different year.
 * zh: `10/6`, `2027/1/3`; en: `Oct 6`, `Jan 3, 2027`.
 */
export function formatDue(due: string, today: string, locale: Locale = getLocale()): string {
  if (due === today) return translate("今天", locale);
  if (due === shiftDay(today, 1)) return translate("明天", locale);
  return formatMonthDay(due, today, locale);
}

/**
 * Always-numeric month/day (formatDue swaps in words for today / tomorrow; the menu's right-hand hint needs numbers).
 * zh: `10/12`, next year `2027/1/3`; en: `Oct 12`, `Jan 3, 2027`.
 */
export function formatMonthDay(key: string, today: string, locale: Locale = getLocale()): string {
  const d = parseKey(key);
  if (!d) return key;
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  if (locale === "en") {
    const opts: Intl.DateTimeFormatOptions = sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
    return fmt("en-US", opts).format(d);
  }
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return sameYear ? md : `${d.getFullYear()}/${md}`;
}

/** Short weekday: zh `周三`, en `Wed` (Wednesday doesn't fit the narrow date column) */
export function formatWeekday(key: string, locale: Locale = getLocale()): string {
  const d = parseKey(key);
  if (!d) return "";
  return locale === "en" ? fmt("en-US", { weekday: "short" }).format(d) : fmt("zh-CN", { weekday: "short" }).format(d);
}

/** Day number (the large serif one in the date column) */
export function dayOfMonth(key: string): number {
  return parseKey(key)?.getDate() ?? 0;
}

/** Page title: zh `10 月 8 日` + `周四`; en `October 8` + `Thursday` */
export function formatDayTitle(key: string, locale: Locale = getLocale()): { main: string; sub: string } {
  const d = parseKey(key);
  if (!d) return { main: key, sub: "" };
  if (locale === "en") {
    return {
      main: fmt("en-US", { month: "long", day: "numeric" }).format(d),
      sub: fmt("en-US", { weekday: "long" }).format(d),
    };
  }
  return {
    main: `${d.getMonth() + 1} 月 ${d.getDate()} 日`, // i18n-ignore Chinese branch; English uses Intl above
    sub: fmt("zh-CN", { weekday: "short" }).format(d),
  };
}

export type RelativeDay = "today" | "yesterday" | "tomorrow";

/** Relative name for the date (a language-neutral id, shown by the UI via t()); null unless it's one day either side */
export function relativeDayLabel(key: string, today: string): RelativeDay | null {
  if (key === today) return "today";
  if (key === shiftDay(today, -1)) return "yesterday";
  if (key === shiftDay(today, 1)) return "tomorrow";
  return null;
}
