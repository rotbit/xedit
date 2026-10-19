/**
 * Registry for the local document library backend: defaults to browser localStorage;
 * the disk Vault swaps in another implementation via setLocalBackend, with the facade and callers unchanged.
 */

import { createBrowserBackend } from "./browserBackend";
import type { LocalBackend } from "./types";

export type { LocalBackend, LocalDocMeta } from "./types";
export { summarize } from "./types";

/** Broadcast when the backend is swapped (Vault opened/closed) so views depending on the local library reload */
export const LOCAL_BACKEND_CHANGED_EVENT = "xedit:local-backend-changed";

let active: LocalBackend | null = null;
let browser: LocalBackend | null = null;

/** Always the localStorage backend: still needed for migration after switching to the Vault */
export function getBrowserBackend(): LocalBackend {
  browser ??= createBrowserBackend();
  return browser;
}

export function getLocalBackend(): LocalBackend {
  active ??= getBrowserBackend();
  return active;
}

export function setLocalBackend(b: LocalBackend): void {
  active = b;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOCAL_BACKEND_CHANGED_EVENT));
}
