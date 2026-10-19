"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Options<S> {
  /** Captured on press (start coordinates, start value, container rect…) and used for conversion every frame after */
  start: (e: React.PointerEvent<HTMLElement>) => S;
  /**
   * Pointer move → new value. Returning undefined means this frame can't be computed (e.g. container width is 0),
   * so the previous frame's value is kept. Clamp the return value to the valid range yourself: it's what's shown while dragging.
   */
  move: (e: PointerEvent, start: S) => number | undefined;
  /** Commit on release (including cancel): writing the store / localStorage goes here, never during the drag */
  commit: (value: number) => void;
}

/**
 * Divider dragging. The two dividers (the reader's source/preview split, the sidebar's right edge) used to be written separately,
 * both listening only to pointermove/pointerup: when the system grabs the pointer (long-press menu, switching windows)
 * pointerup never arrives and the handle stays "stuck" to the pointer. This unifies them on
 * setPointerCapture + three exits: pointerup/pointercancel/lostpointercapture.
 *
 * The other point is when to persist: each drag frame only updates this hook's state, committing on release,
 * so one drag doesn't write to localStorage (zustand persist) hundreds of times.
 */
export function useDragDivider<S>({ start, move, commit }: Options<S>) {
  /** Live value while dragging; null = not dragging, and the caller shows the persisted value */
  const [value, setValue] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // Callbacks change with renders, but onPointerDown must be stable (or the handle swaps listeners every render); keep the latest in a ref
  const fns = useRef({ start, move, commit });
  useEffect(() => {
    fns.current = { start, move, commit };
  });

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    // Capture the pointer: events still belong to it even when dragged outside the handle (even across iframes/the editor)
    handle.setPointerCapture(e.pointerId);
    const origin = fns.current.start(e);
    let latest: number | null = null;
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      const next = fns.current.move(ev, origin);
      if (next === undefined) return;
      latest = next;
      setValue(next);
    };
    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
      handle.removeEventListener("lostpointercapture", onEnd);
      setDragging(false);
      setValue(null);
      // Don't persist if nothing moved (a plain click on the handle also gets here)
      if (latest !== null) fns.current.commit(latest);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
    // When the system takes the pointer away (window switch, system gesture) pointerup may not come, but this always does
    handle.addEventListener("lostpointercapture", onEnd);
  }, []);

  return { value, dragging, onPointerDown };
}
