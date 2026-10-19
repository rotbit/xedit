/**
 * Orphan drafts: "not yet pushed to the cloud" documents rescued from the mirror on account switch or logout.
 *
 * We used to just clearMirror() on account switch, and the previous account's dirty articles vanished along with their bodies;
 * the cloud had never seen that content, so deleting it meant it was truly gone. Now we first move them, with ownership, into
 * localStorage's `xedit-orphan-drafts`, then clear the mirror:
 * - when the original owner next logs in (reclaimOrphanDrafts) they're written back to the mirror as dirty and pushed by the sync engine;
 * - those with unknown ownership (older-version upgrades, snapshot cleared by the probe) are stored as `{ unknown: true }` and stay put,
 *   not claimed, not uploaded, not deleted, awaiting a future recovery UI;
 * - the orphan list has its own key and sync only reads the mirror index, so it never pushes someone else's drafts under the current account.
 */

import {
  clearMirror,
  getMirrorContent,
  listDirtyMirrorDocs,
  saveMirrorLocal,
  type MirrorMeta,
} from "./docStore";
import { saveAuthSnapshot, type AuthSnapshotUser } from "./authSnapshot";
import {
  clearMirrorOwner,
  mirrorOwnedBy,
  readMirrorOwner,
  sameOwner,
  setMirrorOwner,
  toMirrorOwner,
  type MirrorOwner,
  type MirrorOwnership,
  setSyncHold,
} from "./mirrorOwner";
import { bumpSessionEpoch } from "./sessionEpoch";

export const ORPHAN_DRAFTS_KEY = "xedit-orphan-drafts";

/** Accumulating too many would eat the quota; beyond the cap drop the oldest (most likely nobody wants them anymore) */
const MAX_ORPHANS = 200;

/** Whose draft this is; if unidentifiable it's { unknown: true } and no account may claim it */
export type OrphanOwner = MirrorOwner | { unknown: true };

export interface OrphanDraft {
  id: string;
  title: string;
  category?: string;
  /** Body. Missing when the mirror only pulled metadata (only title/category changed); then only metadata is written back */
  content?: string;
  updatedAt: string;
  /** The mirror rev at the moment of the move, kept only as a record; saveMirrorLocal assigns a fresh version on write-back */
  rev?: number;
  owner: OrphanOwner;
  /** When it was moved in (ms), used only for sorting and the future recovery UI */
  stashedAt: number;
}

export interface StashResult {
  /** Whether all drafts were stashed safely. If false the caller must skip clearing the mirror */
  ok: boolean;
  count: number;
}

function isUnknownOwner(owner: OrphanOwner): owner is { unknown: true } {
  return "unknown" in owner && owner.unknown === true;
}

function readList(): OrphanDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const v: unknown = JSON.parse(localStorage.getItem(ORPHAN_DRAFTS_KEY) ?? "[]");
    if (!Array.isArray(v)) return [];
    return v.filter(
      (d): d is OrphanDraft =>
        !!d && typeof d === "object" && typeof d.id === "string" && !!d.owner
    );
  } catch {
    return [];
  }
}

/** Write back the whole list. Throws when the quota is full, leaving the caller to decide whether to keep clearing */
function writeList(list: OrphanDraft[]) {
  const kept = list.length > MAX_ORPHANS ? list.slice(list.length - MAX_ORPHANS) : list;
  localStorage.setItem(ORPHAN_DRAFTS_KEY, JSON.stringify(kept));
}

/** All orphan drafts in the order they were moved in. Reserved for the future recovery UI */
export function listOrphanDrafts(): OrphanDraft[] {
  return readList().sort((a, b) => a.stashedAt - b.stashedAt);
}

function toDraft(meta: MirrorMeta, owner: OrphanOwner): OrphanDraft {
  const content = getMirrorContent(meta.id);
  return {
    id: meta.id,
    title: meta.title,
    ...(meta.category === undefined ? {} : { category: meta.category }),
    ...(content === null ? {} : { content }),
    updatedAt: meta.updatedAt,
    ...(typeof meta.rev === "number" ? { rev: meta.rev } : {}),
    owner,
    stashedAt: Date.now(),
  };
}

/**
 * Move every dirty (unsynced) article in the mirror, with ownership, into the orphan list. **Must be called before clearing the mirror**.
 * Passing null for owner means unknown ownership, recorded as unknown.
 * ok=false happens in only one case: it couldn't be written (quota full / private mode). Then don't clear the mirror;
 * drafts staying put beats vanishing into thin air.
 */
export function stashOrphanDrafts(owner: MirrorOwner | null): StashResult {
  const dirty = listDirtyMirrorDocs();
  if (dirty.length === 0) return { ok: true, count: 0 };
  const group: OrphanOwner = owner ?? { unknown: true };
  const ids = new Set(dirty.map((d) => d.id));
  // The same person's same document moved in again: the newer wins, don't keep two copies
  const kept = readList().filter((d) => !(ids.has(d.id) && sameGroup(d.owner, group)));
  try {
    writeList([...kept, ...dirty.map((meta) => toDraft(meta, group))]);
    return { ok: true, count: dirty.length };
  } catch {
    return { ok: false, count: 0 };
  }
}

/** Whether two records belong to the same ownership group. unknown only groups with unknown, and never matches a real account */
function sameGroup(a: OrphanOwner, b: OrphanOwner): boolean {
  if (isUnknownOwner(a) || isUnknownOwner(b)) return isUnknownOwner(a) && isUnknownOwner(b);
  return sameOwner(a, b);
}

/**
 * The current account reclaims its drafts into the mirror (marked dirty, then pushed by the sync engine); returns the count reclaimed.
 * Drafts with unidentifiable ownership are left alone.
 */
export function reclaimOrphanDrafts(user: AuthSnapshotUser | MirrorOwner): number {
  const me = toMirrorOwner(user);
  if (!me) return 0;
  const list = readList();
  const mine = list.filter((d) => !isUnknownOwner(d.owner) && sameOwner(d.owner, me));
  if (mine.length === 0) return 0;
  for (const d of mine) {
    saveMirrorLocal(d.id, {
      title: d.title,
      ...(d.content === undefined ? {} : { content: d.content }),
      ...(d.category === undefined ? {} : { category: d.category }),
    });
  }
  const reclaimed = new Set(mine);
  try {
    writeList(list.filter((d) => !reclaimed.has(d)));
  } catch {
    // It's fine if the list can't be cleared: write-back to the mirror is idempotent, next login at worst overwrites with the same content
  }
  return mine.length;
}

export interface AccountSwitchResult {
  ownership: MirrorOwnership;
  /** Number of documents moved into the orphan list */
  stashed: number;
  /** Number of documents reclaimed from the orphan list into the mirror */
  reclaimed: number;
  /** Whether the mirror was cleared */
  cleared: boolean;
  /** Unsynced drafts exist but couldn't be stored: the mirror is kept this time and the caller should notify the user */
  stashFailed: boolean;
}

/**
 * After login is confirmed, settle "who owns this mirror": this is the entire logic of that useAuthMode effect.
 * Pulled out as a plain function so it can be tested directly: it only touches localStorage, no React needed.
 *
 * Three paths: same person keeps using it and reclaims their drafts; a different person first moves old drafts out then clears;
 * unidentifiable moves dirty ones into the unknown group and clears the rest (all cloud copies) for a re-pull.
 */
export function resolveAccountSwitch(user: AuthSnapshotUser): AccountSwitchResult {
  const ownership = mirrorOwnedBy(user);
  const base = { ownership, stashed: 0, reclaimed: 0, cleared: false, stashFailed: false };

  if (ownership === "same") {
    setSyncHold(false);
    saveAuthSnapshot(user);
    return { ...base, reclaimed: reclaimOrphanDrafts(user) };
  }

  // different: a new person, stash the old owner's drafts first; unknown: can't tell whose, record all as the unknown group
  const prevOwner = ownership === "different" ? readMirrorOwner() : null;
  const stash = stashOrphanDrafts(prevOwner);
  if (!stash.ok) {
    // If they can't be stored touch nothing: the mirror stays, ownership stays with the previous person, retry next login.
    // But the sync engine must stop: the cookie is the new account's, and pushing the old owner's dirty docs would cross accounts
    setSyncHold(true);
    return { ...base, stashFailed: true };
  }
  setSyncHold(false);

  // unknown with no unsynced content in the mirror: what's left is all cloud copies, so keeping them loses nothing,
  // and the following sync reconciles against the server list (reconcileMirror), clearing what doesn't belong to this account.
  // But ownership must be claimed right away, or every login would rerun this conservative path
  if (ownership === "different" || stash.count > 0) {
    clearMirror(); // Also clears the account snapshot, so saveAuthSnapshot must come after it
    bumpSessionEpoch(); // In-flight requests from the previous account are void when they return
  }
  setMirrorOwner(user);
  saveAuthSnapshot(user);
  return {
    ...base,
    stashed: stash.count,
    cleared: ownership === "different" || stash.count > 0,
    reclaimed: reclaimOrphanDrafts(user),
  };
}

/**
 * Handoff before logout: move unsynced drafts into the orphan list, then clear the mirror and ownership.
 * Returns false = drafts couldn't be stored and the mirror is left as is (the caller should say so, not silently lose the drafts).
 */
export function stashAndDetachMirror(): boolean {
  const stash = stashOrphanDrafts(readMirrorOwner());
  if (!stash.ok) return false;
  clearMirror();
  clearMirrorOwner();
  bumpSessionEpoch();
  return true;
}
