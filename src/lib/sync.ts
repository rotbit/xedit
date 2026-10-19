/**
 * Sync engine: background push/pull between the mirror and the cloud.
 * Push: PUT dirty mirror docs to the cloud; POST local- docs created while logged out, then remove the local copies;
 * Pull: first a full ?full=1 to build the mirror, then incremental ?since= by updatedAt cursor
 * (dirty docs skipped, local wins); deletions are reconciled via the live id list attached to the response.
 * Triggers: startSync() (entering the workspace), network recovery, page returning to foreground, after save.
 *
 * Three "don't lose content" rules run through the whole file:
 * 1. Only one PUT per document is in flight at a time; edits made meanwhile merge into the next round, never overwriting each other;
 * 2. On response, check the epoch (account switch) and rev (edited while in flight) first; on mismatch don't write local state;
 * 3. A failed push always keeps dirty; better to push once more than let local changes silently vanish.
 */

import {
  applyServerDoc,
  applyServerDocs,
  listDirtyMirrorDocs,
  listMirrorDocs,
  getMirrorContent,
  getMirrorMeta,
  markMirrorSynced,
  rebaseMirror,
  reconcileMirror,
  saveMirrorLocal,
  SYNC_CURSOR_KEY,
  type ServerDoc,
} from "./docStore";
import { getBrowserBackend } from "./localBackend";
import { isSyncHeld } from "./mirrorOwner";
import { isLocalId } from "./localDocs";
import { getSessionEpoch, isCurrentEpoch } from "./sessionEpoch";
import { pullDayLog, pushDayLog } from "./todos/dayLogSync";
import { toast } from "@/components/Toast";
import { UNCATEGORIZED } from "@/lib/docDefaults";
import { t } from "@/i18n/t";

export const SYNC_DONE_EVENT = "xedit:sync-done";

/** How many documents to push concurrently per sync round: more just competes for the same upstream bandwidth and risks server rate limits */
const PUSH_CONCURRENCY = 3;

/** Retry delays for network blips / server 5xx; if still failing afterwards, keep dirty and wait for the next trigger */
const RETRY_DELAYS = [1000, 3000];

let syncing = false;
let pendingRerun = false;

const online = () => typeof navigator === "undefined" || navigator.onLine;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Single-flight queue: at most one in-flight PUT per article; push requests arriving meanwhile merge into "run one more round" */
interface PushEntry {
  running: Promise<boolean>;
  again: boolean;
}
const inFlight = new Map<string, PushEntry>();

/** Whether this document has a push in flight (the keepalive on page hide yields to it, so two requests for one doc don't clash) */
export function isPushInFlight(id: string): boolean {
  return inFlight.has(id);
}

/**
 * PUT with bounded retries. Only network errors and 5xx retry (delays 1s, 3s);
 * 4xx, including 409 conflicts, give the same result however often retried, so the response goes straight up.
 * Returns null = no usable response this time (network error, retries exhausted, or epoch changed).
 */
async function putMirror(id: string, body: unknown, epoch: number): Promise<Response | null> {
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(`/api/documents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      res = null; // Offline / DNS failure etc.
    }
    if (!isCurrentEpoch(epoch)) return null;
    if (res && res.status < 500) return res;
    if (attempt >= RETRY_DELAYS.length) return res;
    await sleep(RETRY_DELAYS[attempt]);
    if (!isCurrentEpoch(epoch) || !online()) return null;
  }
}

/**
 * Keep a history version of the current cloud content. The versions endpoint stores "what the server has right now",
 * so on conflict call it first, and the user can still recover the overwritten changes from the version list.
 */
async function archiveServerVersion(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/documents/${id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // No kind: treated as a manual snapshot, de-duplicated but not throttled, so this "about to be overwritten" content isn't dropped by throttling
      body: JSON.stringify({}),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Push one dirty mirror doc (no queue logic; see pushMirrorDoc for the queue).
 * true = the cloud confirmed this round; any failure keeps dirty.
 */
async function uploadMirrorDoc(id: string): Promise<boolean> {
  if (!online() || isLocalId(id)) return false;
  const meta = getMirrorMeta(id);
  if (!meta?.dirty) return true;
  // When the mirror body hasn't been fetched yet (e.g. just logged in and only changed the category) push only metadata; the API supports partial updates
  const content = getMirrorContent(id);
  // Snapshot at departure: used on response to decide whether this confirmation still counts
  const epoch = getSessionEpoch();
  const rev = meta.rev ?? 0;
  let base = meta.baseUpdatedAt;
  const payload = {
    title: meta.title,
    category: meta.category ?? UNCATEGORIZED,
    ...(content === null ? {} : { content }),
  };
  /** The previous round came back with a conflict: after this round succeeds, tell the user where the cloud copy went */
  let conflict: { archived: boolean } | null = null;

  // A conflict gets at most one more loop (archive the cloud copy → re-push with the new baseline); if it still conflicts keep dirty for next time
  for (let round = 0; round <= 1; round++) {
    const res = await putMirror(
      id,
      { ...payload, ...(base ? { baseUpdatedAt: base } : {}) },
      epoch
    );
    // Epoch changed (account switch / logout cleared the library): this result doesn't belong to the current session; write nothing
    if (!res || !isCurrentEpoch(epoch)) return false;

    if (res.ok) {
      const doc = await res.json().catch(() => null);
      if (!isCurrentEpoch(epoch)) return false;
      // Clear dirty only if rev matches; a mismatch means it was edited in flight and that edit still awaits pushing (the queue runs another round)
      markMirrorSynced(id, rev, typeof doc?.updatedAt === "string" ? doc.updatedAt : undefined);
      if (conflict) {
        toast(
          conflict.archived
            ? t("云端有另一份改动，已存为历史版本，本地内容已覆盖上去")
            : t("云端有另一份改动，历史版本没存下来，本地内容已覆盖上去"),
          "info"
        );
      }
      return true;
    }

    // Old servers ignore baseUpdatedAt and just return 200; a 409 here must be a conflict detected by a new server
    if (res.status !== 409 || round > 0) return false;
    const body = await res.json().catch(() => null);
    const serverUpdatedAt = (body as { doc?: { updatedAt?: unknown } } | null)?.doc?.updatedAt;
    if (!isCurrentEpoch(epoch) || typeof serverUpdatedAt !== "string") return false;
    // Keep pushing even if archiving fails: a snapshot request must not strand this local change
    conflict = { archived: await archiveServerVersion(id) };
    if (!isCurrentEpoch(epoch)) return false;
    base = serverUpdatedAt;
    rebaseMirror(id, base);
  }
  return false;
}

/**
 * Push a single dirty mirror doc; true = confirmed by the cloud.
 *
 * Autosave, manual save, background sync and reconnect all go through here. If a request for the same doc is in flight, no second one opens;
 * it just marks "run another round on return", which reads the latest mirror and pushes the merged content at once;
 * callers get the same promise and await the final round's result.
 */
export function pushMirrorDoc(id: string): Promise<boolean> {
  // Ownership not settled (see mirrorOwner.SYNC_HOLD_KEY): the mirror may hold the previous account's drafts; push nothing
  if (isSyncHeld()) return Promise.resolve(false);
  const flying = inFlight.get(id);
  if (flying) {
    flying.again = true;
    return flying.running;
  }
  const entry: PushEntry = { again: false, running: Promise.resolve(false) };
  inFlight.set(id, entry);
  // One push round: anything unexpected (mirror write failure etc.) is swallowed as false, never letting a reject bubble to callers;
  // nobody handles the autosave chain, so a throw becomes an unhandled rejection
  const round = async () => {
    try {
      return await uploadMirrorDoc(id);
    } catch {
      return false;
    }
  };
  entry.running = (async () => {
    try {
      let result = await round();
      while (entry.again) {
        entry.again = false;
        result = await round();
      }
      return result;
    } finally {
      inFlight.delete(id);
    }
  })();
  return entry.running;
}

/** Upload local documents created while logged out, deleting each one that succeeds (failures wait for next time).
 *  Touches only the browser backend: in Vault mode these "local documents" are files on the user's disk, and logging in must not delete them */
async function drainLocalDocs(): Promise<number> {
  if (isSyncHeld()) return 0;
  const browser = getBrowserBackend();
  let uploaded = 0;
  const pending = [...browser.listDocs()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  for (const meta of pending) {
    const content = browser.getContent(meta.id);
    if (content === null) continue;
    const epoch = getSessionEpoch();
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // clientKey is the local id (local-<uuid>, already unique and stable):
        // if the response is lost and the next round POSTs again, the server returns the same doc for the same key, never uploading twice
        body: JSON.stringify({
          title: meta.title,
          content,
          category: meta.category,
          clientKey: meta.id,
        }),
      });
      if (!isCurrentEpoch(epoch)) return uploaded;
      if (!res.ok) break;
      const doc = (await res.json()) as ServerDoc;
      if (!isCurrentEpoch(epoch)) return uploaded;
      // Persist the server's full row to the mirror: on a resend after a lost response, the same clientKey returns
      // the first stored copy (possibly older than local), so the locally sent content can't masquerade as the cloud version
      const serverContent = typeof doc.content === "string" ? doc.content : content;
      applyServerDoc({ ...doc, content: serverContent });
      // Compare field by field with the cloud copy: if the user edited during the round trip, or the cloud has an earlier upload,
      // write the latest local content as a dirty mirror doc for the push queue, then delete the local copy, losing nothing
      const latestMeta = browser.listDocs().find((d) => d.id === meta.id);
      const latest = browser.getContent(meta.id);
      const changed =
        latest !== null &&
        latestMeta !== undefined &&
        (latest !== serverContent ||
          latestMeta.title !== doc.title ||
          (latestMeta.category ?? UNCATEGORIZED) !== (doc.category ?? UNCATEGORIZED));
      if (changed) {
        try {
          saveMirrorLocal(doc.id, {
            title: latestMeta.title,
            content: latest,
            category: latestMeta.category ?? UNCATEGORIZED,
          });
        } catch {
          continue; // If the mirror can't be written (quota full) don't delete the local copy yet; retry next round
        }
      }
      browser.deleteDoc(meta.id);
      uploaded++;
    } catch {
      break;
    }
  }
  return uploaded;
}

/** Push all dirty mirror docs; concurrency is capped and one doc failing doesn't affect the others */
async function pushDirtyMirrors(): Promise<void> {
  const ids = listDirtyMirrorDocs().map((d) => d.id);
  for (let i = 0; i < ids.length; i += PUSH_CONCURRENCY) {
    await Promise.all(
      ids.slice(i, i + PUSH_CONCURRENCY).map((id) => pushMirrorDoc(id).catch(() => false))
    );
  }
}

/** One full sync round: push then pull. Concurrent calls merge into "finish, then run one more round" */
export async function syncNow(): Promise<void> {
  if (!online()) return;
  if (syncing) {
    pendingRerun = true;
    return;
  }
  syncing = true;
  const epoch = getSessionEpoch();
  try {
    // Push: dirty mirror docs + local documents waiting to upload
    await pushDirtyMirrors();
    if (!isCurrentEpoch(epoch)) return;
    await drainLocalDocs();
    if (!isCurrentEpoch(epoch)) return;
    // Pull: with a cursor and the mirror present (guarding against partially cleared localStorage) go incremental, sending only changed bodies;
    // otherwise rebuild the mirror in full. Incremental responses include all live ids, and hard deletes are reconciled from them.
    const cursor = localStorage.getItem(SYNC_CURSOR_KEY);
    const delta = cursor !== null && listMirrorDocs().length > 0;
    const res = await fetch(
      delta ? `/api/documents?since=${encodeURIComponent(cursor)}` : "/api/documents?full=1"
    );
    if (res.ok) {
      const body = (await res.json()) as
        | ServerDoc[]
        | { docs: (ServerDoc & { deletedAt: string | null })[]; ids: string[] };
      // An account switch/logout happened during this round trip: drop the whole batch, don't write the previous account's articles into the new mirror
      if (!isCurrentEpoch(epoch)) return;
      // The cursor is the max server updatedAt, never the local clock; same-format ISO strings compare lexicographically
      let latest = cursor ?? "";
      let liveIds: Set<string>;
      const incoming: ServerDoc[] = [];
      if (Array.isArray(body)) {
        liveIds = new Set();
        for (const doc of body) {
          liveIds.add(doc.id);
          incoming.push(doc);
          if (doc.updatedAt > latest) latest = doc.updatedAt;
        }
      } else {
        liveIds = new Set(body.ids);
        for (const doc of body.docs) {
          // Soft-deleted ones only advance the cursor; removal from the mirror is left to reconcile below (dirty ones are kept)
          if (!doc.deletedAt) incoming.push(doc);
          if (doc.updatedAt > latest) latest = doc.updatedAt;
        }
      }
      // Persist the whole batch at once: even hundreds of docs touch the index and broadcast only once
      applyServerDocs(incoming);
      reconcileMirror(liveIds);
      if (latest) localStorage.setItem(SYNC_CURSOR_KEY, latest);
      window.dispatchEvent(new CustomEvent(SYNC_DONE_EVENT));
    }
    if (!isCurrentEpoch(epoch)) return;
    // Daily records ride along with document sync: same triggers (entering the workspace, reconnect, foreground).
    // Each swallows its own errors; a log sync failure doesn't affect the document sync result or block the follow-up run
    try {
      await pushDayLog();
    } catch {
      // Push again on the next trigger
    }
    if (!isCurrentEpoch(epoch)) return;
    try {
      await pullDayLog(epoch);
    } catch {
      // Pull again on the next trigger
    }
  } catch {
    // Offline or server error: the mirror stays as is; retry on the next trigger
  } finally {
    syncing = false;
    if (pendingRerun) {
      pendingRerun = false;
      void syncNow();
    }
  }
}

/** Persistent triggers: call once when entering the workspace; returns a cleanup function */
export function startSync(): () => void {
  const onOnline = () => void syncNow();
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncNow();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  void syncNow();
  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
