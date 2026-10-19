// Timestamp display formats. Relative and absolute time are two different conventions; don't force them into one function:
// lists want a casual sense of recency like 「刚刚 / 3 分钟前」 (just now / 3 min ago), details/versions need an exact, verifiable moment.

import { getLocale, type Locale } from "@/i18n/locale";
import { translate } from "@/i18n/t";

/** Invalid dates always display as this, nicer than "NaN/NaN" */
const INVALID = "—";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Casual list timestamp: relative time within a day, a date for anything older */
export function formatRelativeTime(iso: string, locale: Locale = getLocale()): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return translate("刚刚", locale);
  if (diff < 3600_000) return translate("{n} 分钟前", locale, { n: Math.floor(diff / 60_000) });
  if (diff < 86400_000) return translate("{n} 小时前", locale, { n: Math.floor(diff / 3600_000) });
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * Absolute time 「[年/]月/日 时:分」 ([year/]month/day hour:minute). Two options capture callers' differences:
 * - omitCurrentYear: drop the year for the current year (most version-list entries share a year, so it's pure noise)
 * - pad: zero-pad month/day to two digits (the info panel needs them aligned across rows)
 * Hour:minute is always zero-padded.
 */
export function formatDateTime(
  iso: string,
  opts: { omitCurrentYear?: boolean; pad?: boolean } = {}
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return INVALID;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year =
    opts.omitCurrentYear && d.getFullYear() === new Date().getFullYear()
      ? ""
      : `${d.getFullYear()}/`;
  const md = opts.pad ? `${pad2(month)}/${pad2(day)}` : `${month}/${day}`;
  return `${year}${md} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Human-readable byte counts. Shared by quota messages (server) and the admin panel (client); both must match */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
