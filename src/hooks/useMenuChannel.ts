"use client";

import { useCallback, useRef } from "react";

/**
 * Single-subscriber channel from the editor to a floating menu.
 *
 * Why not lift it through props/state: the menu's source of truth is a CodeMirror StateField, and
 * lifting it into React state on every filter keystroke would re-render the whole article view.
 * Here changes are pushed straight to the menu component's own setState, so re-renders stay inside that popover.
 *
 * One subscriber is enough: each editor instance has one menu, and multiple subscribers would only muddy the semantics.
 */
export function useMenuChannel<T>() {
  const cbRef = useRef<((value: T | null) => void) | null>(null);
  const stateRef = useRef<T | null>(null);

  // emit is captured in a closure by the extension when the editor is created, so it must be a stable reference (the editor is built once)
  const emit = useCallback((value: T | null) => {
    stateRef.current = value;
    cbRef.current?.(value);
  }, []);

  const subscribe = useCallback((cb: (value: T | null) => void) => {
    cbRef.current = cb;
    // Replay the current value on subscribe, so a menu mounted after the editor doesn't miss an already-open state
    cb(stateRef.current);
    return () => {
      if (cbRef.current === cb) cbRef.current = null;
    };
  }, []);

  return { emit, subscribe };
}
