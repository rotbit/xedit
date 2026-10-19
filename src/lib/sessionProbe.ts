/**
 * Probe for "does the server still recognize me".
 *
 * When next-auth's client can't get a session it always reports unauthenticated: offline, reverse proxy down, server 500
 * are indistinguishable to it from "really logged out" (fetchData in node_modules/next-auth/lib/client.js
 * returns null for both fetch rejections and non-2xx). So we hit /api/auth/session ourselves:
 * only an explicit "no session" from the server counts as logged out; no answer is treated as offline,
 * the local login state stays valid, and the user keeps editing under their own account.
 *
 * State is a module-level singleton: everyone shares one verdict, and only one probe runs at a time.
 * Each probe carries an epoch number; stopping the probe (or logging in again) voids the in-flight one's result,
 * otherwise a slow response could mark a freshly logged-in account as logged out.
 */

import { getSession } from "next-auth/react";
import { toast } from "@/components/Toast";
import { clearAuthSnapshot, readAuthSnapshot } from "./authSnapshot";
import { t } from "@/i18n/t";

export type ProbeState =
  /** No verdict yet (first probe pending, or server unreachable): optimistically assume still logged in */
  | "pending"
  /** Server says the session exists; waiting for next-auth's provider to catch up */
  | "reachable"
  /** Server explicitly said "no session": this is the real logout */
  | "signed-out";

/** Back off and retry when unreachable: 15s first, doubling up to a 2min cap */
const FIRST_RETRY_MS = 15_000;
const MAX_RETRY_MS = 120_000;
/** Returning to foreground and network recovery fire back to back; probe only once in this window */
const MIN_GAP_MS = 3_000;
/** Per-probe timeout. Reverse proxies can hang a connection without replying; without this the fetch hangs forever and inFlight never releases */
const TIMEOUT_MS = 8_000;

let state: ProbeState = "pending";
const listeners = new Set<() => void>();
/** Number of active subscribers; shut down at zero (StrictMode mounts-unmounts-mounts, and this keeps it from closing by mistake) */
let users = 0;
let inFlight = false;
let lastProbeAt = 0;
let retryMs = FIRST_RETRY_MS;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Current epoch; incremented on stop so an in-flight probe that returns with a mismatch stays quiet */
let generation = 0;
let controller: AbortController | null = null;

function setState(next: ProbeState) {
  if (state === next) return;
  state = next;
  for (const cb of listeners) cb();
}

export function subscribeProbe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getProbeState(): ProbeState {
  return state;
}

/** There's no probing on the server; give the client's first frame the same value so hydration matches */
export function getProbeServerState(): ProbeState {
  return "pending";
}

function clearTimer() {
  if (timer === null) return;
  clearTimeout(timer);
  timer = null;
}

function scheduleRetry() {
  clearTimer();
  if (users === 0) return;
  const delay = retryMs;
  retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
  timer = setTimeout(() => {
    timer = null;
    void probe();
  }, delay);
}

/** Void the in-flight probe: bump the epoch and abort the request */
function invalidateInFlight() {
  generation++;
  controller?.abort();
  controller = null;
  inFlight = false;
}

type SessionAnswer =
  /** Server explicitly says there's no session */
  | "none"
  /** Session still exists */
  | "some"
  /** Not an answer (captive portal, proxy rewrite, mismatched shape): treat as unreachable */
  | "unclear";

/**
 * Interpret the /api/auth/session body.
 * Without a session @auth/core returns JSON null (lib/actions/session.js defaults body to null,
 * then toResponse does JSON.stringify); `{}` also counts as no session;
 * any other shape (string, array, non-object user) yields no verdict and must never be used to mark someone logged out.
 */
function readSessionAnswer(body: unknown): SessionAnswer {
  if (body === null) return "none";
  if (typeof body !== "object" || Array.isArray(body)) return "unclear";
  const user = (body as { user?: unknown }).user;
  if (user === undefined || user === null) return "none";
  return typeof user === "object" ? "some" : "unclear";
}

/** Probe once; the verdict is one of the three ProbeState values */
async function probe(): Promise<void> {
  if (users === 0 || inFlight) return;
  // The browser itself says it's offline, so this probe is bound to fail; skip it (and spare the console a wall of red)
  if (!navigator.onLine) {
    scheduleRetry();
    return;
  }
  const gen = generation;
  // Snapshot of the confirmation time at start. If it changed on return, the user logged in again in between,
  // so this probe's "no session" is stale news and must not clear the new login state
  const confirmedAtBefore = readAuthSnapshot()?.confirmedAt ?? null;
  inFlight = true;
  lastProbeAt = Date.now();
  const ctrl = new AbortController();
  controller = ctrl;
  const killer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/api/auth/session", {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: ctrl.signal,
    });
    if (gen !== generation) return; // Voided: this probe belongs to the previous round
    if (res.status !== 200) {
      scheduleRetry(); // A server error isn't "no session"; keep the status quo
      return;
    }
    // Auth portals or reverse proxies may return an HTML page with 200, which isn't an answer:
    // if JSON can't be parsed fall into the catch below as unreachable, never marking the user logged out
    const body: unknown = await res.json();
    if (gen !== generation) return;
    const answer = readSessionAnswer(body);
    if (answer === "some") {
      // The session is actually fine; next-auth's fetch just failed transiently. getSession() broadcasts a message,
      // SessionProvider refetches on receipt and status returns to authenticated (not update():
      // it knocks status back to loading and the whole workspace flickers)
      setState("reachable");
      await getSession();
      scheduleRetry(); // In case the provider doesn't catch up, nudge again after a while
      return;
    }
    if (answer === "unclear") {
      scheduleRetry();
      return;
    }
    if ((readAuthSnapshot()?.confirmedAt ?? null) !== confirmedAtBefore) {
      // The snapshot was rewritten during the probe = the user logged in again; this "no session" is stale
      scheduleRetry();
      return;
    }
    // Server explicitly says there's no session: only now clear the local login state.
    // The mirror isn't cleared: it may still hold unpushed changes; account switches are handled by useAuthMode's ownership check
    clearTimer();
    clearAuthSnapshot();
    setState("signed-out");
    toast(t("登录已过期，请重新登录"), "info");
  } catch {
    // Aborted on timeout, network-layer failure, or a non-JSON response: server unreachable
    if (gen !== generation) return;
    scheduleRetry();
  } finally {
    clearTimeout(killer);
    if (controller === ctrl) controller = null;
    // A changed epoch means this probe was voided long ago and inFlight belongs to the new one; don't release it on its behalf
    if (gen === generation) inFlight = false;
  }
}

/** Network is back or the page returned to foreground: reset backoff and probe again immediately */
function wake() {
  if (state === "signed-out") return;
  if (Date.now() - lastProbeAt < MIN_GAP_MS) return;
  retryMs = FIRST_RETRY_MS;
  clearTimer();
  void probe();
}

const onOnline = () => wake();
const onVisible = () => {
  if (document.visibilityState === "visible") wake();
};

/** Start probing (repeat calls start it only once); returns a stop function */
export function startProbing(): () => void {
  users++;
  if (users === 1) {
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    void probe();
  }
  return () => {
    users--;
    if (users > 0) return;
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    clearTimer();
    invalidateInFlight();
    retryMs = FIRST_RETRY_MS;
    lastProbeAt = 0;
    setState("pending");
  };
}

/** For unit tests: reset module-level singleton state (so tests don't pollute each other) */
export function __resetProbeForTests() {
  clearTimer();
  invalidateInFlight();
  listeners.clear();
  users = 0;
  state = "pending";
  retryMs = FIRST_RETRY_MS;
  lastProbeAt = 0;
}
