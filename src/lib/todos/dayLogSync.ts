/**
 * Cloud sync for the day log: local localStorage (events.ts) ↔ /api/day-log.
 *
 * Push: events.ts marks events dirty on every change (with rev) and records deletions in a pending-delete set; here we debounce 5s and PUT in batches.
 *    On success, check the epoch (account switch) first, then clear dirty marks by rev — an entry merged again while in flight has a new rev and waits for the next round.
 * Pull: runs alongside document sync (syncNow in sync.ts): a full fetch by date the first time, then incremental by updatedAt cursor.
 *    If there are local changes not yet pushed, local wins and the server copy is skipped.
 * Debounced pushes only happen after startDayLogSync starts (i.e. in the signed-in workspace): local mode must make no requests.
 */

import { isSyncHeld } from "@/lib/mirrorOwner";
import { getSessionEpoch, isCurrentEpoch } from "@/lib/sessionEpoch";
import { readLocal, writeLocal } from "@/features/workspace/lib/storage";
import { shiftDay, todayKey } from "./dates";
import {
  DAY_LOG_CHANGED_EVENT,
  DAY_LOG_CURSOR_KEY,
  listDayLogKeys,
  readDayEvents,
  readDeleted,
  readDirty,
  writeDayEvents,
  writeDeleted,
  writeDirty,
  type DayEvent,
} from "./events";

const ENDPOINT = "/api/day-log";
/** Matches the server's per-request limit */
const BATCH = 200;
const PUSH_DEBOUNCE_MS = 5000;
/** Days to fetch on the first full pull: matches local retention; anything older would just be removed by pruneOld */
const PULL_DAYS = 60;
/** Max pages per incremental pull: guards against infinite loops if the server misbehaves; the rest comes next sync */
const MAX_PULL_PAGES = 10;
/** keepalive request bodies are capped at 64KB; leave some headroom */
const KEEPALIVE_MAX_BYTES = 60_000;

/** Event as sent by the server */
export interface ServerDayEvent {
  id: string;
  day: string;
  ts: number;
  end: number | null;
  kind: DayEvent["kind"];
  docId: string | null;
  title: string | null;
  chars: number | null;
  text: string | null;
  deleted: boolean;
  updatedAt: string;
}

interface UpsertPayload {
  id: string;
  day: string;
  ts: number;
  end: number | null;
  kind: DayEvent["kind"];
  docId: string | null;
  title: string | null;
  chars: number | null;
  text: string | null;
}

const online = () => typeof navigator === "undefined" || navigator.onLine;

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let pendingRerun = false;

function toPayload(day: string, e: DayEvent): UpsertPayload {
  return {
    id: e.id,
    day,
    ts: e.ts,
    end: e.end ?? null,
    kind: e.kind,
    docId: e.docId ?? null,
    title: e.title ?? null,
    chars: e.chars ?? null,
    text: e.text ?? null,
  };
}

/**
 * Collect events to push from the dirty marks. Each day is read only once;
 * marks pointing at events no longer local (removed by pruneOld, or stale marks) go into orphans and are cleared after a successful push.
 */
function collectDirty(): { upserts: { payload: UpsertPayload; rev: number }[]; orphans: Map<string, number> } {
  const dirty = readDirty();
  const byDay = new Map<string, Map<string, DayEvent>>();
  const upserts: { payload: UpsertPayload; rev: number }[] = [];
  const orphans = new Map<string, number>();
  for (const [id, { day, rev }] of Object.entries(dirty)) {
    let events = byDay.get(day);
    if (!events) {
      events = new Map(readDayEvents(day).map((e) => [e.id, e]));
      byDay.set(day, events);
    }
    const e = events.get(id);
    if (e) upserts.push({ payload: toPayload(day, e), rev });
    else orphans.set(id, rev);
  }
  return { upserts, orphans };
}

/** Clear dirty marks after a successful push: only when rev matches; a mismatch means it changed in flight, leave it for next round */
function clearDirtyRevs(sent: Map<string, number>): void {
  const dirty = readDirty();
  let changed = false;
  for (const [id, rev] of sent) {
    if (dirty[id]?.rev === rev) {
      delete dirty[id];
      changed = true;
    }
  }
  if (changed) writeDirty(dirty);
}

function clearDeleted(sent: string[]): void {
  if (sent.length === 0) return;
  const done = new Set(sent);
  writeDeleted(readDeleted().filter((id) => !done.has(id)));
}

type PushResult = "ok" | "stop";

/** One push round: batched PUTs. Any failure keeps the dirty marks — retrying 401/4xx won't help, wait for the next trigger; network errors and 5xx also retry next time */
async function pushOnce(): Promise<PushResult> {
  const { upserts, orphans } = collectDirty();
  const deleted = readDeleted();
  if (upserts.length === 0 && deleted.length === 0) {
    if (orphans.size > 0) clearDirtyRevs(orphans);
    return "ok";
  }
  const epoch = getSessionEpoch();
  const rounds = Math.max(Math.ceil(upserts.length / BATCH), Math.ceil(deleted.length / BATCH));
  for (let i = 0; i < rounds; i++) {
    const up = upserts.slice(i * BATCH, (i + 1) * BATCH);
    const del = deleted.slice(i * BATCH, (i + 1) * BATCH);
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upsert: up.map((u) => u.payload), delete: del }),
      });
    } catch {
      return "stop"; // Offline / DNS failure: keep the dirty marks
    }
    // Epoch changed (signed out / switched account, local log already wiped by clearDayLog): this ack isn't for the current session
    if (!isCurrentEpoch(epoch)) return "stop";
    if (!res.ok) return "stop";
    clearDirtyRevs(new Map(up.map((u) => [u.payload.id, u.rev])));
    clearDeleted(del);
  }
  if (orphans.size > 0) clearDirtyRevs(orphans);
  return "ok";
}

/**
 * Push local dirty changes to the cloud. Single-flight: if a round is already running, just set pendingRerun and run once more afterwards with fresh state.
 * Swallow all unexpected errors — nobody handles rejections on the debounce timer path.
 */
export async function pushDayLog(): Promise<void> {
  if (!online() || isSyncHeld()) return;
  if (pushing) {
    pendingRerun = true;
    return;
  }
  if (Object.keys(readDirty()).length === 0 && readDeleted().length === 0) return;
  pushing = true;
  try {
    let result: PushResult;
    do {
      pendingRerun = false;
      result = await pushOnce().catch((): PushResult => "stop");
    } while (pendingRerun && result === "ok");
  } finally {
    pushing = false;
  }
}

/** Debounced push: write events fire about once a second, batch for 5s; does nothing if sync isn't started (local mode) */
export function scheduleDayLogPush(): void {
  if (!started) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void pushDayLog();
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Flush changes still in the debounce window right away when the page is hidden / closed. keepalive results can't be read,
 * so dirty marks aren't cleared — they're pushed again next time, and the server's upsert by id is idempotent. Anything past the keepalive limit waits for next time.
 */
function flushOnHide(): void {
  if (isSyncHeld() || !online()) return;
  const { upserts } = collectDirty();
  const deleted = readDeleted().slice(0, BATCH);
  if (upserts.length === 0 && deleted.length === 0) return;
  const encoder = new TextEncoder();
  const body = { upsert: [] as UpsertPayload[], delete: deleted };
  for (const u of upserts.slice(0, BATCH)) {
    body.upsert.push(u.payload);
    if (encoder.encode(JSON.stringify(body)).length > KEEPALIVE_MAX_BYTES) {
      body.upsert.pop();
      break;
    }
  }
  try {
    void fetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // fetch may throw synchronously while the page is unloading; ignore
  }
}

/** Start the day-log sync's long-lived listeners (mounted alongside startSync); returns a cleanup function */
export function startDayLogSync(): () => void {
  started = true;
  const onHide = () => flushOnHide();
  window.addEventListener("pagehide", onHide);
  return () => {
    started = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    window.removeEventListener("pagehide", onHide);
  };
}

/** Server event → local event: omit null fields to match the shape logEvent writes */
function fromServer(s: ServerDayEvent): DayEvent {
  const e: DayEvent = { id: s.id, ts: s.ts, kind: s.kind };
  if (s.end !== null) e.end = s.end;
  if (s.docId !== null) e.docId = s.docId;
  if (s.title !== null) e.title = s.title;
  if (s.chars !== null) e.chars = s.chars;
  if (s.text !== null) e.text = s.text;
  return e;
}

/**
 * Pure function: merge a batch of server events into local state ({ dateKey: event[] }).
 * - ids in skipIds (dirty marks + pending deletes) are skipped: there are unpushed local changes, local wins;
 * - deleted ones are removed from whichever day holds them (found by id, not relying on the day field);
 * - the rest overwrite / insert by id into event.day; if the same id exists under another local date key, remove it there first;
 * - changed days are sorted by ts ascending.
 * Returns the full merged state and the changed date keys (inputs are not mutated).
 */
export function applyServerEvents(
  local: Record<string, DayEvent[]>,
  incoming: ServerDayEvent[],
  skipIds: Set<string>
): { days: Record<string, DayEvent[]>; changed: string[] } {
  const days: Record<string, DayEvent[]> = {};
  const where = new Map<string, string>();
  for (const [day, list] of Object.entries(local)) {
    days[day] = [...list];
    for (const e of list) where.set(e.id, day);
  }
  const changed = new Set<string>();
  const removeFrom = (day: string, id: string) => {
    days[day] = days[day].filter((e) => e.id !== id);
    changed.add(day);
  };
  for (const s of incoming) {
    if (skipIds.has(s.id)) continue;
    const at = where.get(s.id);
    if (s.deleted) {
      if (at !== undefined) {
        removeFrom(at, s.id);
        where.delete(s.id);
      }
      continue;
    }
    const e = fromServer(s);
    if (at !== undefined && at !== s.day) removeFrom(at, s.id);
    const list = (days[s.day] ??= []);
    const i = at === s.day ? list.findIndex((x) => x.id === s.id) : -1;
    if (i >= 0) list[i] = e;
    else list.push(e);
    where.set(s.id, s.day);
    changed.add(s.day);
  }
  for (const day of changed) days[day].sort((a, b) => a.ts - b.ts);
  return { days, changed: [...changed] };
}

/** Read all local logs so applyServerEvents can find the same id across dates */
function readAllLocal(): Record<string, DayEvent[]> {
  const out: Record<string, DayEvent[]> = {};
  for (const key of listDayLogKeys()) out[key] = readDayEvents(key);
  return out;
}

function isServerEvent(v: unknown): v is ServerDayEvent {
  const e = v as ServerDayEvent;
  return (
    !!e &&
    typeof e.id === "string" &&
    typeof e.day === "string" &&
    typeof e.ts === "number" &&
    typeof e.kind === "string" &&
    typeof e.deleted === "boolean"
  );
}

/**
 * Pull the day log from the cloud and merge it locally. epoch comes from syncNow: if the account changed midway, drop the whole batch.
 * With a cursor, go incremental via ?since= (keep paging while pages are full); without one, fetch the last 60 days by date.
 */
export async function pullDayLog(epoch: number): Promise<void> {
  if (!online() || isSyncHeld()) return;
  let cursor = readLocal(DAY_LOG_CURSOR_KEY);
  const changedAll = new Set<string>();
  for (let page = 0; page < MAX_PULL_PAGES; page++) {
    const url = cursor
      ? `${ENDPOINT}?since=${encodeURIComponent(cursor)}`
      : `${ENDPOINT}?from=${shiftDay(todayKey(), -PULL_DAYS)}`;
    const res = await fetch(url);
    if (!isCurrentEpoch(epoch) || !res.ok) break;
    const body = (await res.json().catch(() => null)) as {
      events?: unknown;
      cursor?: unknown;
      hasMore?: unknown;
    } | null;
    if (!isCurrentEpoch(epoch) || !body || !Array.isArray(body.events)) break;
    const incoming = body.events.filter(isServerEvent);
    if (incoming.length > 0) {
      // Re-read the skip set per page: the user may have logged new events while the previous page was applied
      const skip = new Set([...Object.keys(readDirty()), ...readDeleted()]);
      const { days, changed } = applyServerEvents(readAllLocal(), incoming, skip);
      for (const day of changed) {
        writeDayEvents(day, days[day]);
        changedAll.add(day);
      }
    }
    const next = typeof body.cursor === "string" ? body.cursor : null;
    // Cursor only moves forward (same-format ISO strings compare lexicographically); apply first, then advance: a mid-way failure re-fetches this batch next time
    if (next && (!cursor || next > cursor)) {
      cursor = next;
      writeLocal(DAY_LOG_CURSOR_KEY, cursor);
    }
    // Only page on when the server says there's more; also stop if the cursor didn't advance, to avoid spinning in place
    if (body.hasMore !== true || next !== cursor) break;
  }
  if (changedAll.size > 0 && isCurrentEpoch(epoch)) {
    // Dispatch once per batch; detail keeps the string date-key convention, using today when multiple days changed (listeners only use it to trigger a reread)
    const today = todayKey();
    const detail = changedAll.has(today) ? today : [...changedAll].sort().pop()!;
    window.dispatchEvent(new CustomEvent(DAY_LOG_CHANGED_EVENT, { detail }));
  }
}
