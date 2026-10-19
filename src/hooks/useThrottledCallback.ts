"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * Trailing throttle: multiple calls within the wait window merge into one, using the last call's arguments.
 *
 * Built for the editor's onChange -- pushing the whole body into the store on every keystroke re-renders the entire article view;
 * coalescing to once every ~120ms cuts renders during continuous typing.
 * The catch is that the latest content may still be held in the window, so flush() is required: blur, doc switch, unmount, ⌘S --
 * any moment the content is about to be read must flush it first; it must never be lost.
 */
export interface ThrottledCallback<T> {
  (value: T): void;
  /** Fire the pending call immediately (no-op if there is none) */
  flush(): void;
  /** Discard the pending call */
  cancel(): void;
}

export function useThrottledCallback<T>(
  fn: (value: T) => void,
  wait: number
): ThrottledCallback<T> {
  // The callback may change identity every render, but the throttler itself must be stable (timer and pending value live in its closure),
  // so the throttler only reads this ref, and the latest callback is stored into it after commit
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Wrapped in { value }: the value itself may be an empty string, so it can't be used to tell whether something is pending
  const pendingRef = useRef<{ value: T } | null>(null);

  const throttled = useMemo<ThrottledCallback<T>>(() => {
    const stopTimer = () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    const emit = () => {
      timerRef.current = null;
      const next = pendingRef.current;
      if (!next) return;
      pendingRef.current = null;
      fnRef.current(next.value);
    };

    const call = ((value: T) => {
      pendingRef.current = { value };
      // Only start the timer when the window is idle: later calls in the window just update the pending value, sent together when it fires
      if (timerRef.current === null) timerRef.current = setTimeout(emit, wait);
    }) as ThrottledCallback<T>;

    call.flush = () => {
      stopTimer();
      emit();
    };
    call.cancel = () => {
      stopTimer();
      pendingRef.current = null;
    };
    return call;
  }, [wait]);

  // Safety net on unmount (and when the throttler is replaced): the component is gone but the pending value remains, otherwise the last edit would vanish
  useEffect(() => () => throttled.flush(), [throttled]);

  return throttled;
}
