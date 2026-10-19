/**
 * Local account snapshot: when offline or the server is unreachable, next-auth can't get a session, so this remembers "who I am" locally,
 * letting you keep editing under your own account offline, with a name and avatar to render in the account row.
 * Only display identity fields are stored, no credentials -- auth always happens on the server, and this snapshot has no authority.
 *
 * It only answers "does this device's login state still count". "Whose local mirror is this" is a separate question, in lib/mirrorOwner:
 * the snapshot can be cleared on expiry or when a probe decides you're logged out, but ownership mustn't go with it -- otherwise the next account to log in
 * would treat the previous person's unpushed drafts as its own.
 */

import { mirrorOwnedBy } from "./mirrorOwner";

/** Account info in the snapshot; fields match session.user so the UI can use either */
export interface AuthSnapshotUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface AuthSnapshot extends AuthSnapshotUser {
  /** When the server last confirmed the login (ms); pushed forward on every online confirmation */
  confirmedAt: number;
}

/** Exported for cross-tab listeners: another tab writing/clearing this key means the login state changed there */
export const AUTH_SNAPSHOT_KEY = "xedit-auth-user";
/**
 * Old versions only stored a boolean flag with no account info. Still written: the inline first-paint script
 * (THEME_INIT_SCRIPT in src/app/layout.tsx, public/theme-init.js) sets data-ws from it,
 * hiding the landing page with CSS before React runs. For old users without a snapshot it also doubles as the "has logged in" fallback.
 */
const LEGACY_KEY = "xedit-was-authed";

/** Aligned with session.maxAge in auth.ts: the local copy also expires after a year */
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * JSON.parse on every render produces a new object, so the auth.user reference would change every frame
 * and all downstream memoization would be wasted. Cache one copy, invalidated on write/clear.
 */
let cached: AuthSnapshot | null | undefined;

/** Read once and cache. This path runs during render, so a localStorage exception must not take the page down */
function load(): AuthSnapshot | null {
  if (typeof window === "undefined") return null;
  if (cached !== undefined) return cached;
  cached = null;
  try {
    const raw = localStorage.getItem(AUTH_SNAPSHOT_KEY);
    if (raw === null) return cached;
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === "object" && typeof (v as AuthSnapshot).confirmedAt === "number") {
      cached = v as AuthSnapshot;
    } else {
      // Drop corrupt data so the old flag can still act as a fallback
      localStorage.removeItem(AUTH_SNAPSHOT_KEY);
    }
  } catch {
    // Parse failure or storage unavailable: treat as no snapshot
  }
  return cached;
}

/** Whether the snapshot is still within its validity period. Clock skew only affects this check and won't wrongly clear data */
function fresh(snap: AuthSnapshot): boolean {
  return Date.now() - snap.confirmedAt < MAX_AGE_MS;
}

/** Account snapshot within its validity period; null if expired or missing */
export function readAuthSnapshot(): AuthSnapshot | null {
  const snap = load();
  return snap && fresh(snap) ? snap : null;
}

/**
 * Raw read ignoring expiry. Only for mirrorOwner's one-time migration:
 * "who created this mirror" has nothing to do with whether the snapshot expired; an expired snapshot still identifies the person.
 */
export function peekAuthSnapshot(): AuthSnapshot | null {
  return load();
}

/**
 * Whether this account is the same person as the local mirror's owner.
 * @deprecated Ownership checks have moved to lib/mirrorOwner; this forwarder only remains so old call sites don't silently take the wrong branch.
 * New code should use `mirrorOwnedBy()` directly: it separates "can't tell" into unknown instead of always treating it as the same person.
 */
export function isSameAuthUser(user: AuthSnapshotUser): boolean {
  return mirrorOwnedBy(user) !== "different";
}

/**
 * Record a server-confirmed login. confirmedAt is pushed forward each time, so the local copy effectively renews on a sliding window.
 * It doesn't record ownership -- mirror ownership is written separately by mirrorOwner.setMirrorOwner.
 */
export function saveAuthSnapshot(user: AuthSnapshotUser) {
  const snap: AuthSnapshot = {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    image: user.image ?? null,
    confirmedAt: Date.now(),
  };
  cached = snap;
  try {
    localStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(snap));
    localStorage.setItem(LEGACY_KEY, "1");
  } catch {
    // localStorage throws in private mode: this session still works, the account just won't be recognized next time
  }
}

/** Clears the local login state. Mirror ownership (mirrorOwner) isn't cleared here: as long as the cache exists, it still belongs to that person */
export function clearAuthSnapshot() {
  cached = null;
  try {
    localStorage.removeItem(AUTH_SNAPSHOT_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Same as above; nothing else to do if clearing fails
  }
}

/**
 * "Has this device ever logged in". A snapshot is authoritative when present (expired means void);
 * the old boolean flag only counts for old users without a snapshot yet -- it's replaced by one after the first online confirmation.
 */
export function wasAuthed(): boolean {
  if (typeof window === "undefined") return false;
  const snap = load();
  if (snap) return fresh(snap);
  try {
    return localStorage.getItem(LEGACY_KEY) === "1";
  } catch {
    return false;
  }
}
