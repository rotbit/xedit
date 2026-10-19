"use client";

import { useSyncExternalStore } from "react";
import { toast } from "@/components/Toast";
import { t } from "@/i18n/t";

export interface SyncFailure {
  nodeToken: string;
  title: string;
  reason: string;
}

export interface SyncItem {
  title: string;
  action: "created" | "updated";
}

/** One batch result, matching the server's SyncBatchResult */
interface SyncBatch {
  done: boolean;
  total: number;
  pending: number;
  created: number;
  updated: number;
  skipped: number;
  unsupported: number;
  failed: SyncFailure[];
  items: SyncItem[];
  nextUp: string[];
}

/** Sync progress accumulated across rounds (skipped/unsupported/total use the last round's full counts) */
export interface SyncProgress {
  created: number;
  updated: number;
  skipped: number;
  pending: number;
  total: number;
  failed: SyncFailure[];
}

export interface FeishuSyncState {
  syncing: boolean;
  /** First batch not back yet: still scanning the wiki tree (takes a few seconds for large spaces) */
  scanning: boolean;
  /** A batch request failed transiently and is backing off to retry (attempt starts at 1) */
  retry: { attempt: number; reason: string } | null;
  /** Stop was clicked; waiting for the loop to exit at a safe point */
  cancelling: boolean;
  /** Title of the doc being processed (the nextUp from the previous batch, i.e. the batch running now) */
  current: string[];
  /** Recently finished docs, newest first */
  recent: SyncItem[];
  progress: SyncProgress | null;
  /** Why the last sync was interrupted; cleared when a new round starts, stays null on completion */
  error: string | null;
  /** Whether the interruption notice has been seen in the dialog (the bottom-right pill uses this to decide whether to nag) */
  errorAcked: boolean;
  /** Authorization expired and needs reconnecting; cleared via ackReconnect once the dialog switches back to the connect screen */
  reconnectRequired: boolean;
}

/**
 * The sync loop lives at module level rather than in the dialog: closing the dialog keeps it running and reopening picks up the progress,
 * and it naturally prevents duplicate starts. Closing/refreshing the page does interrupt it (the browser drives the loop);
 * the next sync skips unchanged docs and resumes from where it left off.
 */
let state: FeishuSyncState = {
  syncing: false,
  scanning: false,
  retry: null,
  cancelling: false,
  current: [],
  recent: [],
  progress: null,
  error: null,
  errorAcked: true,
  reconnectRequired: false,
};

/** The stop request lives outside the store: it's a one-shot signal for the loop and doesn't need to trigger a render */
let cancelRequested = false;

const listeners = new Set<() => void>();

function emit(patch: Partial<FeishuSyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getState = () => state;

export function useFeishuSync(): FeishuSyncState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** Lets non-React code (e.g. focus-return callbacks) check whether a sync is running */
export const isFeishuSyncing = () => state.syncing;

/** Called after the dialog consumes reconnectRequired and switches back to the 「连接飞书」 (Connect Feishu) screen */
export function ackReconnect() {
  if (state.reconnectRequired) emit({ reconnectRequired: false });
}

/** Closing the dialog counts as seeing the interruption notice; the bottom-right pill stops nagging (the reason stays in the panel) */
export function ackSyncError() {
  if (state.error && !state.errorAcked) emit({ errorAcked: true });
}

/** Clears the last progress display when disconnecting (disconnecting isn't allowed mid-sync, so this only applies when idle) */
export function clearFeishuSyncProgress() {
  if (!state.syncing) emit({ progress: null, recent: [], current: [], error: null });
}

/** Request a stop: the loop exits at a safe point (between batches or while backing off), and progress is kept for resuming */
export function cancelFeishuSync() {
  if (!state.syncing || state.cancelling) return;
  cancelRequested = true;
  emit({ cancelling: true });
}

/** Terminal failures auto-retry can't fix: an explicit business error, or a manual stop */
class SyncAbort extends Error {
  needReconnect: boolean;
  manual: boolean;
  constructor(message: string, opts: { needReconnect?: boolean; manual?: boolean } = {}) {
    super(message);
    this.needReconnect = opts.needReconnect ?? false;
    this.manual = opts.manual ?? false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sleep in small steps so clicking "stop" during a long backoff takes effect within half a second */
async function backoff(ms: number) {
  const step = 500;
  for (let waited = 0; waited < ms && !cancelRequested; waited += step) {
    await sleep(Math.min(step, ms - waited));
  }
}

/** Backoff schedule; once exhausted, stay on the last step instead of giving up, so retries ride out longer outages like deploys or network drops */
const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000];

/**
 * Single batch request: network errors, non-JSON responses (proxy timeouts returning HTML) and 5xx/429 are treated as transient
 * and retried with endless backoff -- the sync keeps going as long as the page is open, no manual resume needed; the stop button can interrupt anytime.
 * 4xx business errors (not logged in / authorization expired / bad params) aren't worth retrying, so stop right away.
 * Batches are idempotent on the server -- a batch that wrote but lost its response is skipped as "unchanged" on rerun.
 */
async function fetchBatch(payload: object): Promise<SyncBatch> {
  for (let attempt = 0; ; attempt++) {
    if (cancelRequested) throw new SyncAbort(t("已手动停止"), { manual: true });
    let transient: string;
    try {
      const res = await fetch("/api/feishu/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: (SyncBatch & { error?: string; needReconnect?: boolean }) | null = await res
        .json()
        .catch(() => null);
      if (res.ok && data) {
        if (state.retry) emit({ retry: null });
        return data;
      }
      if (data && res.status < 500 && res.status !== 429) {
        throw new SyncAbort(data.error ?? t("同步失败"), {
          needReconnect: Boolean(data.needReconnect),
        });
      }
      transient = data?.error ?? t("服务端暂时不可用（HTTP {status}）", { status: res.status });
    } catch (e) {
      if (e instanceof SyncAbort) throw e;
      transient = t("网络请求失败");
    }
    emit({ retry: { attempt: attempt + 1, reason: transient } });
    await backoff(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
  }
}

const RECENT_MAX = 8;

export async function startFeishuSync(
  space: { id: string; name: string },
  onSynced: () => void
): Promise<void> {
  if (state.syncing) return;
  cancelRequested = false;
  emit({
    syncing: true,
    scanning: true,
    retry: null,
    cancelling: false,
    current: [],
    recent: [],
    progress: null,
    error: null,
    errorAcked: true,
    reconnectRequired: false,
  });
  const acc: SyncProgress = { created: 0, updated: 0, skipped: 0, pending: 0, total: 0, failed: [] };
  // Send this round's failed nodes back for the server to skip, so a bad doc isn't retried every batch and doesn't stall progress
  const skip: string[] = [];
  try {
    // The server only handles a small batch per call (to avoid timeouts); loop until done. The 300-round cap is just a guard against infinite loops
    for (let round = 0; round < 300; round++) {
      const data = await fetchBatch({ spaceId: space.id, spaceName: space.name, skip });
      for (const f of data.failed) {
        if (f.nodeToken) skip.push(f.nodeToken);
        // Token-less entries like truncation notices can repeat every round, so dedupe before adding to the list
        if (!acc.failed.some((x) => x.nodeToken === f.nodeToken && x.title === f.title)) {
          acc.failed.push(f);
        }
      }
      acc.created += data.created;
      acc.updated += data.updated;
      acc.skipped = data.skipped + data.unsupported;
      acc.pending = data.pending;
      acc.total = data.total;
      // During a gradual rollout, an older server may not return these two fields yet
      const items = Array.isArray(data.items) ? data.items : [];
      const nextUp = Array.isArray(data.nextUp) ? data.nextUp : [];
      emit({
        scanning: false,
        current: data.done ? [] : nextUp,
        recent: [...[...items].reverse(), ...state.recent].slice(0, RECENT_MAX),
        progress: { ...acc, failed: [...acc.failed] },
      });
      if (data.done) break;
    }
    toast(
      acc.created + acc.updated > 0
        ? t("同步完成：新增 {created} 篇，更新 {updated} 篇", { created: acc.created, updated: acc.updated })
        : t("同步完成：内容没有变化"),
      "success"
    );
    onSynced();
  } catch (e) {
    const msg = e instanceof Error ? e.message : t("同步失败");
    const manual = e instanceof SyncAbort && e.manual;
    // The interruption reason always goes into the panel rather than a fleeting toast; synced batches are already stored, so it can resume
    emit({
      error: msg,
      // A stop the user clicked doesn't need a pill reminder
      errorAcked: manual,
      reconnectRequired: e instanceof SyncAbort && e.needReconnect,
    });
    toast(manual ? t("同步已停止，随时可以继续") : msg, manual ? "info" : "error");
  } finally {
    emit({ syncing: false, scanning: false, retry: null, cancelling: false, current: [] });
  }
}
