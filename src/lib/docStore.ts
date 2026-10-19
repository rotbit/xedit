/**
 * Local mirror of cloud documents (the core of local-first):
 * after login every cloud doc is mirrored into localStorage, and reads/writes always hit the mirror first;
 * the cloud is just a sync target. Offline, listing, reading, and editing all work normally; once online the sync engine pushes and pulls.
 */

import { clearAuthSnapshot } from "./authSnapshot";
import { notifyDocsChanged, summarize } from "./localDocs";
import { bumpSessionEpoch } from "./sessionEpoch";
import { clearDayLog } from "./todos/events";
import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";

export interface MirrorMeta {
  id: string;
  title: string;
  category?: string;
  /** Creation time (ISO). Old mirrors lack this field; it's backfilled when a doc is opened and revalidated */
  createdAt?: string;
  updatedAt: string;
  excerpt?: string;
  chars?: number;
  /** Local has edits not yet persisted to the cloud */
  dirty?: boolean;
  /**
   * Local revision: incremented on each saveMirrorLocal, starting at 1. Old indexes lack this field and count as 0.
   * On push we record the rev sent, and only clear dirty when the response arrives and rev hasn't changed;
   * otherwise a slow response would clear edits made after it was sent, and those changes would never get pushed.
   */
  rev?: number;
  /**
   * The server updatedAt this local copy derives from. PUT sends it so the server can detect conflicts:
   * if someone else (another device / MCP) edited in between, the server returns 409 instead of silently overwriting.
   */
  baseUpdatedAt?: string;
}

export interface ServerDoc {
  id: string;
  title: string;
  category?: string | null;
  /** Sent by the list / incremental / full / single-doc APIs; older servers or other sources may omit it */
  createdAt?: string;
  updatedAt: string;
  content: string;
}

const INDEX_KEY = "xedit-mirror-index";
const DOC_PREFIX = "xedit-mirror-doc:";
/** Incremental sync cursor: the max updatedAt seen at the last successful pull (server time, ISO string) */
export const SYNC_CURSOR_KEY = "xedit-sync-cursor";

function readIndex(): MirrorMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeIndex(list: MirrorMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

export function listMirrorDocs(): MirrorMeta[] {
  return readIndex().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getMirrorMeta(id: string): MirrorMeta | null {
  return readIndex().find((d) => d.id === id) ?? null;
}

export function getMirrorContent(id: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DOC_PREFIX + id);
}

/** Current local revision; old indexes without this field count as 0 */
export function getMirrorRev(id: string): number {
  return getMirrorMeta(id)?.rev ?? 0;
}

/**
 * Write a local edit to the mirror: written immediately and marked dirty; the sync engine pushes it to the cloud later.
 * dirty=false is for metadata corrections the cloud has already confirmed (e.g. after an online category move succeeds).
 *
 * Write failures (quota full) are always thrown, never swallowed: callers need to tell the user, and the content is still in the editor.
 * Body is written before the index, so if the body fails the index isn't touched at all, avoiding
 * a half-written state like "index says 5000 chars but the body is still the old one".
 */
export function saveMirrorLocal(
  id: string,
  patch: { title?: string; content?: string; category?: string },
  dirty = true
) {
  const list = readIndex();
  let meta = list.find((d) => d.id === id);
  if (!meta) {
    const now = new Date().toISOString();
    meta = { id, title: UNTITLED_DOC, createdAt: now, updatedAt: now };
    list.unshift(meta);
  }
  // Write the body first: if this throws, the index changes below only live in this temp array and local state is untouched
  if (patch.content !== undefined) localStorage.setItem(DOC_PREFIX + id, patch.content);
  if (patch.title !== undefined) meta.title = patch.title.slice(0, 200) || UNTITLED_DOC;
  if (patch.category !== undefined) meta.category = patch.category.trim() || UNCATEGORIZED;
  if (patch.content !== undefined) Object.assign(meta, summarize(patch.content));
  meta.updatedAt = new Date().toISOString();
  meta.rev = (meta.rev ?? 0) + 1;
  if (dirty) meta.dirty = true;
  writeIndex(list);
  notifyDocsChanged();
}

/** Write a cloud doc into the mirror; skipped if local has unpushed edits (dirty), local wins */
export function applyServerDoc(doc: ServerDoc) {
  applyServerDocs([doc]);
}

export interface ApplyServerDocsResult {
  /** Number of docs actually written into the mirror */
  applied: number;
  /** Number skipped because local is newer (dirty) or content is identical */
  skipped: number;
  /** Ids of docs whose body write failed (quota full); these don't enter the index */
  failed: string[];
}

/**
 * Write a whole batch of cloud docs into the mirror. A full sync is hundreds of docs; going through applyServerDoc one by one
 * would deserialize + serialize the index hundreds of times (O(n²)) and broadcast list refreshes hundreds of times;
 * here the whole batch reads the index once, writes once, and broadcasts once.
 *
 * Local-first rules still apply: dirty docs are skipped; docs identical to the mirror field by field are skipped too, so bodies aren't rewritten for nothing.
 * A single body write failure (quota full) is recorded in failed and the rest continue; the index only includes docs written successfully.
 */
export function applyServerDocs(docs: ServerDoc[]): ApplyServerDocsResult {
  const list = readIndex();
  const byId = new Map(list.map((d) => [d.id, d]));
  const result: ApplyServerDocsResult = { applied: 0, skipped: 0, failed: [] };
  for (const doc of docs) {
    const existing = byId.get(doc.id);
    if (existing?.dirty) {
      result.skipped++;
      continue;
    }
    const updatedAt =
      typeof doc.updatedAt === "string" ? doc.updatedAt : new Date(doc.updatedAt).toISOString();
    const category = doc.category ?? UNCATEGORIZED;
    const createdAt = doc.createdAt
      ? typeof doc.createdAt === "string"
        ? doc.createdAt
        : new Date(doc.createdAt).toISOString()
      : existing?.createdAt;
    if (
      existing &&
      // Old mirror lacks creation time but the server sent one this time: don't skip as identical, backfill it on this pass
      existing.createdAt === createdAt &&
      existing.title === doc.title &&
      existing.category === category &&
      existing.updatedAt === updatedAt &&
      existing.baseUpdatedAt === updatedAt &&
      getMirrorContent(doc.id) === doc.content
    ) {
      result.skipped++;
      continue;
    }
    try {
      localStorage.setItem(DOC_PREFIX + doc.id, doc.content);
    } catch {
      result.failed.push(doc.id);
      continue;
    }
    const next: MirrorMeta = {
      id: doc.id,
      title: doc.title,
      category,
      ...(createdAt ? { createdAt } : {}),
      updatedAt,
      // This local copy now derives from this server version; the next PUT sends it for conflict detection
      baseUpdatedAt: updatedAt,
      rev: existing?.rev ?? 0,
      ...summarize(doc.content),
    };
    if (existing) Object.assign(existing, next, { dirty: false });
    else {
      list.unshift(next);
      byId.set(doc.id, next);
    }
    result.applied++;
  }
  if (result.applied > 0) {
    writeIndex(list);
    notifyDocsChanged();
  }
  return result;
}

/**
 * Backfill creation time only: old mirrors were created before createdAt existed, and incremental sync only sends changed docs,
 * so untouched old docs would never get it. Backfill from the full row fetched when a doc is opened and revalidated.
 * Writes only when missing, without touching updatedAt / dirty / rev: this isn't an edit and shouldn't trigger a push or conflict check.
 */
export function setMirrorCreatedAt(id: string, iso: string) {
  const list = readIndex();
  const meta = list.find((d) => d.id === id);
  if (!meta || meta.createdAt) return;
  meta.createdAt = iso;
  writeIndex(list);
  notifyDocsChanged();
}

/**
 * Clear dirty after a successful push.
 *
 * confirmedRev is the mirror's rev when this push was sent: if it differs, the user edited again while the request was in flight,
 * so this response only confirms old content and dirty must stay (those edits still need pushing).
 * Either way, baseUpdatedAt is set to the server version: local has indeed seen that version,
 * so the next PUT carrying it won't be flagged as a conflict.
 *
 * @returns whether dirty was actually cleared
 */
export function markMirrorSynced(
  id: string,
  confirmedRev: number,
  serverUpdatedAt?: string
): boolean {
  const list = readIndex();
  const meta = list.find((d) => d.id === id);
  if (!meta) return false;
  const confirmed = (meta.rev ?? 0) === confirmedRev;
  if (confirmed) {
    meta.dirty = false;
    // The PUT response returns the server updatedAt: the mirror stores server time,
    // so machines with fast clocks don't mistake their own just-saved content for "cloud has updates"
    if (serverUpdatedAt) meta.updatedAt = serverUpdatedAt;
  }
  if (serverUpdatedAt) meta.baseUpdatedAt = serverUpdatedAt;
  writeIndex(list);
  return confirmed;
}

/** Only change the server version the local copy is based on, leaving dirty and the body alone (used for re-pushing after conflict resolution) */
export function rebaseMirror(id: string, serverUpdatedAt: string) {
  const list = readIndex();
  const meta = list.find((d) => d.id === id);
  if (!meta) return;
  meta.baseUpdatedAt = serverUpdatedAt;
  writeIndex(list);
}

/** Reconcile with the server list: remove mirrors that no longer exist on the server (deleted/moved to trash) and have no local edits */
export function reconcileMirror(serverIds: Set<string>) {
  const list = readIndex();
  const keep = list.filter((d) => serverIds.has(d.id) || d.dirty);
  for (const d of list) {
    if (!serverIds.has(d.id) && !d.dirty) localStorage.removeItem(DOC_PREFIX + d.id);
  }
  if (keep.length !== list.length) writeIndex(keep);
}

export function removeMirrorDoc(id: string) {
  localStorage.removeItem(DOC_PREFIX + id);
  writeIndex(readIndex().filter((d) => d.id !== id));
}

export function listDirtyMirrorDocs(): MirrorMeta[] {
  return readIndex().filter((d) => d.dirty);
}

/** Clear the mirror on logout so the next account can't see the previous account's docs; the local account snapshot is cleared too */
export function clearMirror() {
  for (const d of readIndex()) localStorage.removeItem(DOC_PREFIX + d.id);
  localStorage.removeItem(INDEX_KEY);
  localStorage.removeItem(SYNC_CURSOR_KEY);
  // Daily records (including pending dirty flags) also belong to the previous account; keeping them would push them as the next account's records
  clearDayLog();
  clearAuthSnapshot();
  // Generation +1: in-flight push/pull requests from the previous account will see the generation changed and discard their results,
  // so the previous account's content won't be written into the freshly cleared mirror
  bumpSessionEpoch();
}
