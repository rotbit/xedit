/**
 * 「本月」 (This month) stats on the Today page: roll each day's local records this month into daily numbers and a monthly total.
 *
 * Reads only the local log (kept 60 days), no cloud: this is a personal sense of rhythm, not a precise report;
 * older days that can't be read are simply 0. read is injectable so tests don't touch localStorage.
 */

import { readDayEvents, type DayEvent } from "./events";

export interface DayStat {
  key: string;
  chars: number;
  tasks: number;
  created: number;
  versions: number;
  active: boolean;
  future: boolean;
}

export interface MonthStats {
  /** YYYY-MM */
  month: string;
  days: DayStat[];
  chars: number;
  tasks: number;
  created: number;
  activeDays: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Month of a date key: the key is already zero-padded YYYY-MM-DD, so take the first 7 chars */
export function monthOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

function dayStat(key: string, today: string, read: (key: string) => DayEvent[]): DayStat {
  // Future days can't have records, so don't read storage for them
  if (key > today) return { key, chars: 0, tasks: 0, created: 0, versions: 0, active: false, future: true };
  const events = read(key);
  let chars = 0;
  let tasks = 0;
  let created = 0;
  let versions = 0;
  for (const e of events) {
    // Deleting text still counts as writing (active) but not as output: negative deltas per write entry count as 0,
    // so one big deletion doesn't drag the whole day's count negative and break the bar chart
    if (e.kind === "write") chars += Math.max(0, e.chars ?? 0);
    else if (e.kind === "task") tasks++;
    else if (e.kind === "create") created++;
    else if (e.kind === "version") versions++;
  }
  return { key, chars, tasks, created, versions, active: events.length > 0, future: false };
}

export function monthStats(
  month: string,
  today: string,
  read: (key: string) => DayEvent[] = readDayEvents
): MonthStats {
  const [y, m] = month.split("-").map(Number);
  // Day 0 rolls back to the last day of the previous month, which is exactly the day count of month m (Date handles leap Februaries)
  const count = new Date(y, m, 0).getDate();
  const days: DayStat[] = [];
  for (let d = 1; d <= count; d++) days.push(dayStat(`${y}-${pad(m)}-${pad(d)}`, today, read));
  return {
    month,
    days,
    chars: days.reduce((s, d) => s + d.chars, 0),
    tasks: days.reduce((s, d) => s + d.tasks, 0),
    created: days.reduce((s, d) => s + d.created, 0),
    activeDays: days.filter((d) => d.active).length,
  };
}
