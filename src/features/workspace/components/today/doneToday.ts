/**
 * Data for the Today page's left column "Done this week": check events from the daily log — today's, earlier days this week, and the all-time count.
 * The page and the left column share one result (the page uses it to decide whether everything is empty), so it's a pure function that reads the log once per render.
 * Everything uses the same dedupe rule (doneOn), so earlier days and today are counted the same way.
 */
import type { TodoItem } from "@/lib/todos/collect";
import { daysBetween, nextMonday, shiftDay } from "@/lib/todos/dates";
import { listDayLogKeys, readDayEvents, type DayEvent } from "@/lib/todos/events";

const sameTask = (text: string | undefined, docId: string | undefined) => `${docId ?? ""}|${text ?? ""}`;

/**
 * Check events for one day, oldest first; if the same line in the same doc was checked, unchecked and checked again, keep only the last.
 * Items still in the left-column list are left out: one just checked stays in the list struck through, and an unchecked one is back in the list —
 * the review excludes them too, otherwise an unchecked task would linger in earlier days looking "done".
 */
function doneOn(day: string, shown: Set<string>): DayEvent[] {
  const last = new Map<string, DayEvent>();
  const tasks = readDayEvents(day)
    .filter((e) => e.kind === "task")
    .sort((a, b) => a.ts - b.ts);
  // Map keeps first-insertion order: delete then set so the order reflects the latest check time
  for (const e of tasks) {
    const k = sameTask(e.text, e.docId);
    last.delete(k);
    last.set(k, e);
  }
  return [...last.entries()].filter(([k]) => !shown.has(k)).map(([, e]) => e);
}

const shownOf = (rows: TodoItem[]) => new Set(rows.map((r) => sameTask(r.text, r.docId)));

export function doneToday(today: string, rows: TodoItem[]): DayEvent[] {
  return doneOn(today, shownOf(rows));
}

/**
 * What got done on each of the last `days` days (yesterday back to `days` ago, excluding today — today belongs to "Done").
 * Days with no records are skipped to avoid a run of empty headings; newest date first.
 */
export function doneRecent(
  today: string,
  rows: TodoItem[],
  days = 7
): { day: string; events: DayEvent[] }[] {
  const shown = shownOf(rows);
  const out: { day: string; events: DayEvent[] }[] = [];
  for (let i = 1; i <= days; i++) {
    const day = shiftDay(today, -i);
    const events = doneOn(day, shown);
    if (events.length > 0) out.push({ day, events });
  }
  return out;
}

/**
 * What got done on earlier days this week (from Monday), excluding today — today is listed separately by doneToday and can be undone.
 * Looks back as many days as today's weekday index (Monday = 0 days, returns empty); newest first, days without records skipped.
 */
export function doneThisWeek(today: string, rows: TodoItem[]): { day: string; events: DayEvent[] }[] {
  // Next Monday 7 days away means today is Monday, 6 means Tuesday…; work back to today's index in the week (Monday = 0)
  const weekday = 7 - daysBetween(today, nextMonday(today));
  return weekday > 0 ? doneRecent(today, rows, weekday) : [];
}

/**
 * How many things were ever done in the local log: the number on the right of the "Completed history" entry.
 * Deduped per day by doneOn (same line in the same doc counts once, last event), not excluding left-column rows — it's the grand total, independent of the current list.
 */
export function doneCountAll(): number {
  const none = new Set<string>();
  let n = 0;
  for (const day of listDayLogKeys()) n += doneOn(day, none).length;
  return n;
}

/**
 * How much was written today: for the summary line under the date.
 * chars are net deltas (deletions negative), summed as such — write 1000 and delete 800, and "wrote 200 chars" is the honest number; omit the count if the net isn't positive.
 * "Docs edited" counts distinct docs written to or created today.
 */
export function writingToday(day: string): { chars: number; docs: number } {
  const events = readDayEvents(day);
  let chars = 0;
  const docs = new Set<string>();
  for (const e of events) {
    if (e.kind !== "write" && e.kind !== "create") continue;
    if (e.docId) docs.add(e.docId);
    if (e.kind === "write") chars += e.chars ?? 0;
  }
  return { chars: Math.max(0, chars), docs: docs.size };
}
