/**
 * Day log for the 「做了」 (Done) column: one localStorage key per day; signed-in users also sync to the cloud via dayLogSync.
 *
 * Local is still the first stop: keying by day means reading a day parses only that day, and pruning old logs is just deleting keys;
 * offline or signed out (local mode), it's all the data there is. Once signed in, local also serves as cache and offline queue —
 * every change marks the event dirty (with rev), deletions go into a pending-delete set, and the sync module pushes them with a debounce.
 */

import { readLocal, removeLocal, writeLocal } from "@/features/workspace/lib/storage";
import { dayKeyOf, shiftDay } from "./dates";
import { scheduleDayLogPush } from "./dayLogSync";

export interface DayEvent {
  /** Client-generated unique id: makes cloud upload idempotent (re-pushes overwrite the same row) and locates events for cross-device deletes */
  id: string;
  ts: number;
  /** Last save time after write merging; duration = end - ts */
  end?: number;
  kind: "write" | "create" | "version" | "task";
  docId?: string;
  title?: string;
  /** Character delta for write; negative when deleting text */
  chars?: number;
  /** Task text for task events */
  text?: string;
}

export const DAY_LOG_CHANGED_EVENT = "xedit:day-log-changed";

export const DAY_LOG_PREFIX = "xedit-day-log:";
/** Date of the last old-log cleanup: cleanup walks every key, once a day is enough */
const PRUNED_KEY = "xedit-day-log-pruned";
/** Changes waiting to be pushed: { [id]: { day, rev } }. rev increments on every change and is only cleared when the push response's rev matches,
 *  so a merge that lands while the request is in flight isn't wrongly cleared by that success */
export const DIRTY_KEY = "xedit-day-log-dirty";
/** ids deleted locally but not yet reported to the server */
export const DELETED_KEY = "xedit-day-log-deleted";
/** Incremental pull cursor (ISO string of server updatedAt): kept here so clearDayLog can clear it too */
export const DAY_LOG_CURSOR_KEY = "xedit-day-log-cursor";
/** Consecutive saves of the same doc within this interval count as one writing session */
export const WRITE_MERGE_MS = 30 * 60_000;
/** Days of local logs to keep (the server doesn't prune and keeps full history) */
export const KEEP_DAYS = 60;

const KINDS = new Set<DayEvent["kind"]>(["write", "create", "version", "task"]);

export type DirtyMap = Record<string, { day: string; rev: number }>;

/** Event id: prefer randomUUID; on old browsers / insecure contexts without it, fall back to timestamp + random string, collisions negligible */
export function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // randomUUID throws in insecure contexts; fall through to the fallback below
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function notify(detail: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DAY_LOG_CHANGED_EVENT, { detail }));
  }
}

export function readDirty(): DirtyMap {
  const raw = readLocal(DIRTY_KEY);
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as DirtyMap) : {};
  } catch {
    return {};
  }
}

export function writeDirty(map: DirtyMap): void {
  if (Object.keys(map).length === 0) removeLocal(DIRTY_KEY);
  else writeLocal(DIRTY_KEY, JSON.stringify(map));
}

/** Mark dirty: bump rev; day records the latest key it lives under, used at push time to find the event */
function markDirty(ids: { id: string; day: string }[]): void {
  if (ids.length === 0) return;
  const map = readDirty();
  for (const { id, day } of ids) map[id] = { day, rev: (map[id]?.rev ?? 0) + 1 };
  writeDirty(map);
}

export function readDeleted(): string[] {
  const raw = readLocal(DELETED_KEY);
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeDeleted(ids: string[]): void {
  if (ids.length === 0) removeLocal(DELETED_KEY);
  else writeLocal(DELETED_KEY, JSON.stringify(ids));
}

/** Write a day's events back locally; delete the key for an empty array instead of leaving "[]" around */
export function writeDayEvents(key: string, list: DayEvent[]): void {
  if (list.length === 0) removeLocal(DAY_LOG_PREFIX + key);
  else writeLocal(DAY_LOG_PREFIX + key, JSON.stringify(list));
}

/** Date keys of all local logs (without prefix) */
export function listDayLogKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(DAY_LOG_PREFIX)) keys.push(k.slice(DAY_LOG_PREFIX.length));
    }
  } catch {
    // Storage unavailable: treat as no logs
  }
  return keys;
}

export function readDayEvents(key: string): DayEvent[] {
  const raw = readLocal(DAY_LOG_PREFIX + key);
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  // Storage is user-editable: drop entries with missing fields so the UI doesn't render NaN
  const valid = list.filter(
    (e): e is DayEvent =>
      !!e && typeof e === "object" && typeof (e as DayEvent).ts === "number" && KINDS.has((e as DayEvent).kind)
  );
  // One-time migration: entries logged before cloud sync have no id; add one in place, write back and mark dirty,
  // so existing records get pushed after sign-in too, and every later read sees the same stable id
  const patched: { id: string; day: string }[] = [];
  for (const e of valid) {
    if (typeof e.id !== "string" || !e.id) {
      e.id = newEventId();
      patched.push({ id: e.id, day: key });
    }
  }
  if (patched.length > 0) {
    writeDayEvents(key, valid);
    markDirty(patched);
    scheduleDayLogPush();
  }
  return valid;
}

/** Delete log keys older than 60 days; remember today's cleanup so we don't walk again the same day.
 *  Only prunes the local cache, never dirty marks or the server: the server doesn't prune and keeps full history */
function pruneOld(today: string) {
  if (readLocal(PRUNED_KEY) === today) return;
  writeLocal(PRUNED_KEY, today);
  const cutoff = shiftDay(today, -KEEP_DAYS);
  // Collect from listDayLogKeys before deleting: deleting while iterating shifts indexes
  for (const k of listDayLogKeys()) if (k < cutoff) removeLocal(DAY_LOG_PREFIX + k);
}

/**
 * Log an event. write events merge: if the day's last entry is a write for the same doc within 30 minutes,
 * add up the characters and push the end time to now — autosave fires every few hundred ms, so without merging a day could log thousands.
 * Only the "last entry" counts: if another event intervenes (new doc, archive, switching docs) a new segment starts, so the timeline reads right.
 * Both new and merged entries are marked dirty and trigger a (debounced) cloud push.
 */
export function logEvent(e: Omit<DayEvent, "ts" | "id"> & { ts?: number }): void {
  const ts = e.ts ?? Date.now();
  const key = dayKeyOf(new Date(ts));
  const list = readDayEvents(key);
  const last = list[list.length - 1];
  let id: string;
  if (
    e.kind === "write" &&
    last?.kind === "write" &&
    last.docId === e.docId &&
    ts - (last.end ?? last.ts) <= WRITE_MERGE_MS
  ) {
    last.chars = (last.chars ?? 0) + (e.chars ?? 0);
    last.end = ts;
    if (e.title) last.title = e.title; // Title changed mid-writing; keep the latest
    id = last.id;
  } else {
    id = newEventId();
    list.push({ ...e, id, ts });
  }
  writeDayEvents(key, list);
  markDirty([{ id, day: key }]);
  pruneOld(key);
  notify(key);
  scheduleDayLogPush();
}

/**
 * Delete an entry by id: remove it locally, add it to the pending-delete set (the push tells the server to tombstone it), and clear its dirty mark —
 * no point upserting a deleted event. If not found, do nothing and dispatch nothing: most likely another tab already deleted it.
 */
export function removeDayEvent(key: string, id: string): void {
  const list = readDayEvents(key);
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return;
  list.splice(i, 1);
  writeDayEvents(key, list);
  const dirty = readDirty();
  if (dirty[id]) {
    delete dirty[id];
    writeDirty(dirty);
  }
  const deleted = readDeleted();
  if (!deleted.includes(id)) writeDeleted([...deleted, id]);
  notify(key);
  scheduleDayLogPush();
}

/**
 * Clear the local day log and its sync state. Called by docStore.clearMirror on sign-out / account switch:
 * logs, dirty marks, pending deletes and the cursor all belong to the previous account; carried over, they'd be pushed as the next account's records.
 */
export function clearDayLog(): void {
  for (const k of listDayLogKeys()) removeLocal(DAY_LOG_PREFIX + k);
  removeLocal(DIRTY_KEY);
  removeLocal(DELETED_KEY);
  removeLocal(DAY_LOG_CURSOR_KEY);
  removeLocal(PRUNED_KEY);
}
