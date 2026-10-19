"use client";

import { useEffect, useRef } from "react";
import type { CustomThemeSpec } from "@/lib/themes/custom";
import type { SidebarOrder } from "@/features/workspace/lib/sidebarOrder";

/**
 * Single read/write channel for `/api/settings`.
 *
 * The first screen used to fetch `/api/settings` from two places (typography preferences + custom categories/sidebar ordering),
 * and each wrote separately: two concurrent PUTs in the same second, or a burst of them while dragging to reorder.
 * Here reads collapse into one module-level promise (both subscribers share it), and writes into one debounced channel
 * (merged per field, last write wins). The server PUT updates per field incrementally,
 * so sending only changed fields is fine; omitted fields aren't cleared.
 */

/** Raw row from the GET (any field may be missing; the whole thing is null for old accounts that never created the row) */
export interface UserSettingsRow {
  themeId?: string | null;
  codeThemeId?: string | null;
  customCss?: string | null;
  customThemes?: string | null;
  macCode?: boolean | null;
  linkFootnote?: boolean | null;
  categories?: string | null;
  sidebarOrder?: string | null;
}

/** Writable fields; arrays/objects are serialized by the server, the client sends them as-is */
export interface SettingsPatch {
  themeId?: string;
  customCss?: string;
  linkFootnote?: boolean;
  customThemes?: CustomThemeSpec[];
  categories?: string[];
  sidebarOrder?: SidebarOrder;
}

const WRITE_DEBOUNCE_MS = 1000;

let loadPromise: Promise<UserSettingsRow | null> | null = null;
let pendingPatch: SettingsPatch | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let flushHooked = false;

/**
 * Reads cloud settings once. Repeat calls within a session share the same promise;
 * failures aren't cached -- a 401 right as the login state changes shouldn't block later successful reads.
 */
export function loadSettings(): Promise<UserSettingsRow | null> {
  if (loadPromise) return loadPromise;
  loadPromise = fetch("/api/settings")
    .then((r) => (r.ok ? (r.json() as Promise<UserSettingsRow | null>) : Promise.reject()))
    .catch(() => {
      loadPromise = null;
      return null;
    });
  return loadPromise;
}

function sendPatch(patch: SettingsPatch, keepalive = false): void {
  void fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    keepalive,
  }).catch(() => undefined); // Silent on write failure: the next change retries with the latest values
}

/** Send pending changes immediately (the page is leaving, or the caller explicitly wants them persisted) */
export function flushSettingsWrite(keepalive = false): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!pendingPatch) return;
  const patch = pendingPatch;
  pendingPatch = null;
  sendPatch(patch, keepalive);
}

/**
 * Queue a write: batch for 1s into a single PUT. Later writes to the same field win,
 * and different fields merge into one request (typography preferences and sidebar ordering often change together).
 */
export function queueSettingsWrite(patch: SettingsPatch): void {
  pendingPatch = { ...pendingPatch, ...patch };
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flushSettingsWrite();
  }, WRITE_DEBOUNCE_MS);
  // Closing the tab right after reordering: the write still in the debounce window must not be lost
  if (!flushHooked && typeof window !== "undefined") {
    flushHooked = true;
    window.addEventListener("pagehide", () => flushSettingsWrite(true));
  }
}

/**
 * After login, feeds cloud settings to apply, once per subscriber.
 * All callers share loadSettings' single GET, so more subscribers don't mean more requests.
 *
 * @param onSettled Called once the read settles (success or failure); callers use it to know
 *        "the cloud copy has landed" and must not write local values back before then.
 */
export function useCloudSettings(
  enabled: boolean,
  apply: (row: UserSettingsRow) => void,
  onSettled?: () => void
): void {
  // The callback is a new function every render, so keep it in a ref: loading should only be triggered once by enabled
  const applyRef = useRef(apply);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    applyRef.current = apply;
    settledRef.current = onSettled;
  });

  // Depends only on enabled: load once per login state flip; logging out and back in reloads (resetSettings already invalidated the cache).
  // Don't add a "run once" ref guard -- StrictMode mounts → unmounts → remounts effects,
  // the guard would skip the second run while the first was already cancelled, so cloud settings would never apply
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadSettings()
      .then((row) => {
        if (!cancelled && row) applyRef.current(row);
      })
      .finally(() => {
        if (!cancelled) settledRef.current?.();
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
}

/**
 * Logout / account switch: invalidate the read cache, or the next account would inherit the previous one's settings.
 * Changes pending in the debounce window belong to the account that hasn't logged out yet, so send them with keepalive before clearing,
 * so a last-second theme change isn't lost to a quick logout.
 */
export function resetSettings(): void {
  flushSettingsWrite(true);
  loadPromise = null;
}
