"use client";

/**
 * Hovering a mark in the body pops up its comment: no clicking, no hunting in the right column.
 *
 * Both enter and leave are slightly delayed:
 * - enter: sweeping across a run of marks shouldn't flash cards all the way; only show once the mouse settles;
 * - leave: moving from the text to the card crosses a gap, so allow time for the mouse to reach the card (once inside, it stays, so Accept can be clicked).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { REVIEW_ID_ATTR } from "./editorMarks";

const SHOW_DELAY = 200;
const HIDE_DELAY = 260;

export function useReviewHover(view: EditorView | null) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  }, []);
  const hold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const release = useCallback(() => later(() => setHoverId(null), HIDE_DELAY), [later]);
  /** Close immediately (after Accept / Ignore, or a click elsewhere) */
  const dismiss = useCallback(() => {
    hold();
    setHoverId(null);
  }, [hold]);

  useEffect(() => {
    if (!view) return;
    const dom = view.contentDOM;
    const idAt = (t: EventTarget | null) =>
      (t as HTMLElement | null)?.closest?.(`[${REVIEW_ID_ATTR}]`)?.getAttribute(REVIEW_ID_ATTR) ??
      null;
    const onOver = (e: MouseEvent) => {
      const id = idAt(e.target);
      if (id) later(() => setHoverId(id), SHOW_DELAY);
    };
    const onOut = (e: MouseEvent) => {
      // Moving within the same mark (across a few child spans) doesn't count as leaving
      const from = idAt(e.target);
      if (from && from !== idAt(e.relatedTarget)) release();
    };
    dom.addEventListener("mouseover", onOver);
    dom.addEventListener("mouseout", onOut);
    return () => {
      dom.removeEventListener("mouseover", onOver);
      dom.removeEventListener("mouseout", onOut);
    };
  }, [view, later, release]);

  useEffect(() => () => hold(), [hold]);

  return { hoverId, hold, release, dismiss };
}
