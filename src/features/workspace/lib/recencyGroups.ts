import { getLocale, htmlLang, type Locale } from "@/i18n/locale";
import { translate } from "@/i18n/t";
import type { DocMeta } from "../types";

/**
 * One group in the timeline. Granularity coarsens with age: one group each for today / yesterday / each day this week, last week as one group, then one per month before that.
 *
 * key has a fixed format that components use to tell the group kind (rather than matching label text, so switching languages can't break it):
 * - "today" / "yesterday"
 * - "day:Y-M-D"   another day within this week
 * - "lastweek"    last Monday through last Sunday
 * - "month:Y-M"   an earlier calendar month
 */
export interface DayGroup {
  /** Group key, also used as the React key; format above */
  key: string;
  /** Large text in the left column: day number "11", or a text label like 「上周」「九月」 */
  heading: string;
  /** Small label under the large text: 「十月 · 今天」 / month name / 「9/29 – 10/5」 / the year when crossing years; may be an empty string */
  sub: string;
  docs: DocMeta[];
}

/** Groups whose large text is a day number (serif 30px); other groups (last week / a month) are text labels and need a smaller size */
export function isDayHeading(key: string): boolean {
  return key === "today" || key === "yesterday" || key.startsWith("day:");
}

/** Relative time is shown on rows only in the today and yesterday groups; earlier, "N days ago" carries no information */
export function showsRelativeTime(key: string): boolean {
  return key === "today" || key === "yesterday";
}

/** Month names come from Intl: zh-CN gives 「九月」, en gives "September", so we don't maintain two tables */
function monthOf(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(htmlLang(locale), { month: "long" }).format(date);
}

/** Local date key: must be built from local year/month/day; toISOString folds back to UTC and files late-night docs under the previous day */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Local midnight. All later day arithmetic uses setDate so Date handles month starts, year starts and DST borrowing itself */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Midnight this Monday. getDay() is 0 for Sunday; convert to "days since Monday": (getDay() + 6) % 7.
 * Then step back with setDate, letting Date carry across months (Wed 10/1 → 9/29) and years (Thu 1/1 → 12/29).
 */
function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  return addDays(day, -((day.getDay() + 6) % 7));
}

/** Short form for date ranges: both languages use "9/29", which takes less space than month names */
function shortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Work out which group a doc belongs to (key / heading / sub only; the caller collects docs) */
function bucketOf(date: Date, now: Date, locale: Locale): Omit<DayGroup, "docs"> {
  const today = startOfDay(now);
  const yesterday = addDays(today, -1);
  const thisWeek = startOfWeek(now);
  const lastWeek = addDays(thisWeek, -7);
  const month = monthOf(date, locale);
  const t = date.getTime();

  // Later than today (client clock skew) counts as today too, without a separate "future" group
  if (t >= today.getTime()) {
    return { key: "today", heading: String(date.getDate()), sub: `${month} · ${translate("今天", locale)}` };
  }
  if (t >= yesterday.getTime()) {
    return { key: "yesterday", heading: String(date.getDate()), sub: `${month} · ${translate("昨天", locale)}` };
  }
  // Other days this week: empty when today is Monday / Tuesday, since yesterday already went into "yesterday"
  if (t >= thisWeek.getTime()) {
    return { key: `day:${dayKey(date)}`, heading: String(date.getDate()), sub: month };
  }
  // Last Monday through last Sunday; when today is Monday last Sunday is already "yesterday", so it's naturally excluded
  if (t >= lastWeek.getTime()) {
    return {
      key: "lastweek",
      heading: translate("上周", locale),
      sub: `${shortDate(lastWeek)} – ${shortDate(addDays(thisWeek, -1))}`,
    };
  }
  // Earlier: by calendar month; the year is added only when crossing years
  return {
    key: `month:${date.getFullYear()}-${date.getMonth() + 1}`,
    heading: month,
    sub: date.getFullYear() === now.getFullYear() ? "" : String(date.getFullYear()),
  };
}

/**
 * Group by recency (updatedAt by default; the "Recently opened" view passes max(opened, edited)).
 * The list is already sorted descending by the same time, so we only collect **consecutive** same-group docs
 * into one group — no reordering, no merging across segments; the order matches the input exactly.
 * now is injectable for testing today / yesterday / week boundaries / year crossings; locale is passed in from useLocale() by the component,
 * so after a language switch the component re-renders and labels are recomputed.
 */
export function groupByRecency(
  docs: DocMeta[],
  now: Date = new Date(),
  locale: Locale = getLocale(),
  timeOf: (doc: DocMeta) => string = (d) => d.updatedAt
): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const doc of docs) {
    const parsed = new Date(timeOf(doc));
    // Bad time data parses to Invalid Date; fall back to now so the whole group doesn't render as NaN
    const date = Number.isNaN(parsed.getTime()) ? now : parsed;
    const bucket = bucketOf(date, now, locale);
    const last = groups[groups.length - 1];
    if (last && last.key === bucket.key) {
      last.docs.push(doc);
      continue;
    }
    groups.push({ ...bucket, docs: [doc] });
  }
  return groups;
}
