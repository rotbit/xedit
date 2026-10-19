"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Singleton dialog host: functions like askInput / askConfirm / askCategoryPick / openAuth that "open a global dialog
 * from anywhere" all rest on the same "module-level opener + one pending resolve".
 * It's extracted to get two easy-to-miss edge cases right once: on reopen and on host unmount, the previous pending promise
 * always settles with the cancel value — the old code just overwrote state, losing the previous resolve so the caller awaited forever.
 *
 * @param cancelValue Value resolved on cancel (backdrop click / Esc / superseded by a new open / host not mounted)
 */
export function createDialogHost<Opts, Result>(cancelValue: Result) {
  // Written when the host mounts. There's only one host at a time (all rendered in Providers), so no need for a stack
  let opener: ((opts: Opts) => Promise<Result>) | null = null;

  /** When the host isn't mounted, return the cancel value immediately so callers don't need extra checks (same as the old behavior) */
  const open = (opts: Opts): Promise<Result> =>
    opener ? opener(opts) : Promise.resolve(cancelValue);

  /**
   * The host component uses this to take over open/close: non-null state means "open", and close(result) fulfills the caller's promise.
   * @param onOpen Resets the host's own extra state on each open (input default, search query, login mode…)
   */
  function useHost(onOpen?: (opts: Opts) => void) {
    const [state, setState] = useState<Opts | null>(null);
    // Keep the pending resolve in a ref: both reopening and unmounting need to reach the previous one to settle it
    const pendingRef = useRef<((value: Result) => void) | null>(null);
    // onOpen is a new function every render; store it in a ref so the effect registering the opener mounts/unmounts only once
    const onOpenRef = useRef(onOpen);
    useEffect(() => {
      onOpenRef.current = onOpen;
    }, [onOpen]);

    /** Close the dialog and fulfill the promise; the pending resolve is used only once, so repeated calls are safe no-ops */
    const close = useCallback((result: Result) => {
      const resolve = pendingRef.current;
      pendingRef.current = null;
      setState(null);
      resolve?.(result);
    }, []);

    useEffect(() => {
      opener = (opts) =>
        new Promise<Result>((resolve) => {
          // Superseded before the previous one finished: settle it as "cancel", or that promise hangs forever
          pendingRef.current?.(cancelValue);
          pendingRef.current = resolve;
          onOpenRef.current?.(opts);
          setState(opts);
        });
      return () => {
        opener = null;
        // Host unmount (e.g. navigating to a page without Providers) mustn't leave callers hanging either
        pendingRef.current?.(cancelValue);
        pendingRef.current = null;
      };
    }, []);

    return { state, close };
  }

  return { open, useHost };
}
