/**
 * Mirror ownership: whose cloud mirror on this machine is this, really.
 *
 * This used to hang off the account snapshot (authSnapshot.isSameAuthUser), but the snapshot carried two jobs:
 * "is the login on this machine still valid" and "who owns the cache". When the probe decided we were logged out it cleared the snapshot, ownership went with it,
 * and the next account to log in claimed the previous person's cache outright. Now that they're split:
 * - the snapshot only tracks login validity, cleared on expiry or detected logout;
 * - the ownership record only changes on account switch or logout; nothing else touches it.
 *
 * Stores only the two identifying fields id / email, none of the display stuff like name or avatar: it's not a second snapshot.
 */

import { peekAuthSnapshot, type AuthSnapshotUser } from "./authSnapshot";

/** Ownership record for this machine's mirror. At least one of id and email; an all-empty record means none */
export interface MirrorOwner {
  id?: string;
  email?: string;
}

/**
 * Relationship between the current account and this machine's mirror:
 * - same: the same person; use the cache as-is
 * - different: definitely a different person; the previous owner's data must be moved out before clearing
 * - unknown: can't tell (no record, or no comparable field on both sides). Neither clear nor claim:
 *   better to park unsynced drafts in the orphan list than delete someone's work on one wrong guess
 */
export type MirrorOwnership = "same" | "different" | "unknown";

export const MIRROR_OWNER_KEY = "xedit-mirror-owner";
/**
 * Push gate. On account switch, if the old owner's unsynced drafts couldn't be moved to the orphan list (quota full), the mirror stays as is,
 * but the cookie already belongs to the new account: the sync engine must never push those dirty docs under the new account.
 * Set a flag so sync pushes nothing until ownership is settled, and clear it when ownership settles on the next login.
 */
export const SYNC_HOLD_KEY = "xedit-sync-hold";

export function isSyncHeld(): boolean {
  try {
    return localStorage.getItem(SYNC_HOLD_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSyncHold(held: boolean) {
  try {
    if (held) localStorage.setItem(SYNC_HOLD_KEY, "1");
    else localStorage.removeItem(SYNC_HOLD_KEY);
  } catch {
    // Can't write even a byte: the gate can't be set, so we rely on the caller's toast
  }
}

/** Pick the identifying fields out of any account object; with neither, we can't identify the person */
export function toMirrorOwner(
  user: AuthSnapshotUser | MirrorOwner | null | undefined
): MirrorOwner | null {
  if (!user) return null;
  const id = typeof user.id === "string" && user.id ? user.id : undefined;
  const email = typeof user.email === "string" && user.email ? user.email : undefined;
  return id || email ? { id, email } : null;
}

/** Parse the stored record, dropping junk along the way */
function readRaw(): MirrorOwner | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MIRROR_OWNER_KEY);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    const owner = v && typeof v === "object" ? toMirrorOwner(v as MirrorOwner) : null;
    if (owner) return owner;
    localStorage.removeItem(MIRROR_OWNER_KEY);
  } catch {
    // Parse failure or storage unavailable: treat as never recorded
  }
  return null;
}

/**
 * Ownership of this machine's mirror. Older versions upgrading have no record but do have an account snapshot;
 * that mirror was built by the person in the snapshot, so backfill it once (via peek: expired or not, it counts,
 * since ownership is unrelated to validity). Only if that fails is it truly unknown.
 */
export function readMirrorOwner(): MirrorOwner | null {
  const own = readRaw();
  if (own) return own;
  const migrated = toMirrorOwner(peekAuthSnapshot());
  if (migrated) setMirrorOwner(migrated);
  return migrated;
}

/** Record who owns this mirror. Called after clearing the mirror on account switch and when building it on first login */
export function setMirrorOwner(user: AuthSnapshotUser | MirrorOwner) {
  const owner = toMirrorOwner(user);
  if (!owner) return;
  try {
    localStorage.setItem(MIRROR_OWNER_KEY, JSON.stringify(owner));
  } catch {
    // Can't write in private mode: this session works fine, next time ownership becomes unknown (the conservative path, no wrongful deletes)
  }
}

/** Clear on logout: the mirror is gone, so ownership shouldn't linger */
export function clearMirrorOwner() {
  try {
    localStorage.removeItem(MIRROR_OWNER_KEY);
  } catch {
    // If it can't be cleared there's nothing else to do
  }
}

/** Whether two ownership records are the same person. Compare id if present, else email; if incomparable it's not "definitely the same" */
export function sameOwner(a: MirrorOwner | null, b: MirrorOwner | null): boolean {
  if (!a || !b) return false;
  if (a.id && b.id) return a.id === b.id;
  if (a.email && b.email) return a.email === b.email;
  return false;
}

/** This account's relationship to the local mirror. Anything undecidable is unknown, leaving the caller to take the conservative path */
export function mirrorOwnedBy(user: AuthSnapshotUser | MirrorOwner): MirrorOwnership {
  const prev = readMirrorOwner();
  const next = toMirrorOwner(user);
  if (!prev || !next) return "unknown";
  if (prev.id && next.id) return prev.id === next.id ? "same" : "different";
  if (prev.email && next.email) return prev.email === next.email ? "same" : "different";
  // The record has only an email and we only got an id this time (or vice versa): no comparable field, don't guess
  return "unknown";
}
