"use client";

import { useSyncExternalStore } from "react";
import type { DocMeta } from "../types";
import { readLocal, writeLocal } from "./storage";

/**
 * Local record for "Recently opened": { [docId]: millisecond timestamp of the last open }.
 *
 * Why localStorage instead of the server:
 * - Opening is purely client-side; reading doesn't change the doc, so it shouldn't touch updatedAt or cost an extra API call;
 * - The record only sorts the "Recently opened" view; losing it just falls back to sorting by last edit, with no consistency requirement;
 * - Known trade-off: not synced across devices / browsers; each keeps its own.
 */
const KEY = "xedit.recentOpens";
/** Entry cap: keep only this many recently opened docs so it doesn't grow forever */
const MAX_ENTRIES = 300;
/** Dispatched after writes in this page so useRecentOpens refreshes (the storage event only fires in other tabs) */
export const RECENT_OPENS_EVENT = "xedit:recent-opens";

type Opens = Readonly<Record<string, number>>;

/** The server snapshot and empty record share one constant; useSyncExternalStore requires a stable reference */
const EMPTY: Opens = Object.freeze({});

/** Snapshot cache: return the same object reference while the raw string hasn't changed */
let cacheRaw: string | null | undefined;
let cacheValue: Opens = EMPTY;

function parse(raw: string | null): Opens {
  if (!raw) return EMPTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return EMPTY;
    const out: Record<string, number> = {};
    for (const [id, at] of Object.entries(data as Record<string, unknown>)) {
      if (typeof at === "number" && Number.isFinite(at)) out[id] = at;
    }
    return out;
  } catch {
    return EMPTY;
  }
}

/** Read all open records; bad data returns an empty object. Returns the same reference when content is unchanged */
export function readOpens(): Opens {
  const raw = readLocal(KEY);
  if (raw === cacheRaw) return cacheValue;
  cacheRaw = raw;
  cacheValue = parse(raw);
  return cacheValue;
}

function write(next: Record<string, number>) {
  writeLocal(KEY, JSON.stringify(next));
  cacheRaw = undefined; // Invalidate the snapshot so the next readOpens reparses
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RECENT_OPENS_EVENT));
}

/** Record an open; beyond the cap keep only the newest MAX_ENTRIES */
export function markOpened(id: string, now: number = Date.now()): void {
  let entries = Object.entries({ ...readOpens(), [id]: now });
  if (entries.length > MAX_ENTRIES) {
    entries = entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_ENTRIES);
  }
  write(Object.fromEntries(entries));
}

/** Remove ids no longer in the library; if nothing changed, don't write or dispatch */
export function pruneOpens(liveIds: Iterable<string>): void {
  const live = new Set(liveIds);
  const cur = readOpens();
  const kept = Object.entries(cur).filter(([id]) => live.has(id));
  if (kept.length === Object.keys(cur).length) return;
  write(Object.fromEntries(kept));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) onChange();
  };
  window.addEventListener(RECENT_OPENS_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(RECENT_OPENS_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Subscribe to open records; always an empty object during SSR */
export function useRecentOpens(): Opens {
  return useSyncExternalStore(subscribe, readOpens, () => EMPTY);
}

/**
 * Time used by the "Recently opened" view: the later of last opened and last edited (editing counts as opening).
 * updatedAt parse failures count as 0; when neither exists return updatedAt as-is and let downstream bad-data handling deal with it.
 */
export function recencyOf(doc: DocMeta, opens: Opens): string {
  const opened = opens[doc.id] ?? 0;
  const parsed = Date.parse(doc.updatedAt);
  const updated = Number.isNaN(parsed) ? 0 : parsed;
  const at = Math.max(opened, updated);
  return at > 0 ? new Date(at).toISOString() : doc.updatedAt;
}
