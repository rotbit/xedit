/**
 * What the xEdit desktop shell (Electron) exposes on window via preload.
 * The same site runs both in a normal browser and inside the desktop shell; only the shell has window.xeditDesktop,
 * so desktop-only features check for it. Types live here so callers don't each cast with `as`.
 * Note the first-paint inline script in app/layout.tsx is a string and can't import this; it checks platform itself.
 */

/** Interface exposed by preload (xedit-desktop/preload.js) */
export interface XeditDesktop {
  /** process.platform; on "darwin" the top bar leaves room for the traffic lights */
  platform?: string;
  /** The desktop shell's top bar shows its own draft-progress pill, so the web side stops popping individual toasts */
  draftProgress?: boolean;
  /** Client version (package.json version, e.g. "0.1.1"); shells before 0.1.1 lack this field */
  version?: string;
}

/** "Send to WeChat" relies on the shell's built-in draft service, available from this version; older shells can't reach it */
export const WECHAT_DRAFT_MIN_VERSION = "0.1.1";

/** Get the desktop shell interface; null outside the shell (or during SSR) */
export function desktopShell(): XeditDesktop | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { xeditDesktop?: XeditDesktop }).xeditDesktop ?? null;
}

/** Whether we're running inside the xEdit desktop shell */
export function isDesktopShell(): boolean {
  return desktopShell() !== null;
}

/** Split a version like "0.1.1" into numeric parts; non-numeric parts count as 0 */
const parts = (v: string): number[] => v.split(".").map((n) => Number.parseInt(n, 10) || 0);

/**
 * Whether the desktop shell version is at least min. Outside the shell, or a shell too old to report a version, counts as not satisfied.
 * Only compared on the client; always false during SSR (callers must read it after a click to avoid hydration mismatches).
 */
export function desktopVersionAtLeast(min: string): boolean {
  const v = desktopShell()?.version;
  if (!v) return false;
  const a = parts(v);
  const b = parts(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}
