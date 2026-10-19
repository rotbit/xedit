"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { EditorView } from "@codemirror/view";

/** Breathing room between the menu and the cursor line */
const GAP = 6;
/** Edge padding: stays within the editor column horizontally and off the viewport edges vertically */
const EDGE = 8;

/**
 * Anchor a fixed overlay to a document position in the editor (shared by the slash menu and `[[` completion).
 *
 * Left edge aligned with the trigger character, sitting below the cursor line; flips above the line if there's no room below; follows on scroll and resize.
 * The position is stored along with "which position it was computed for": a changed trigger means the stored position is stale,
 * so stay hidden rather than flash — otherwise the menu would appear at the previous position first and then jump.
 *
 * The overlay's own ref is held and passed in by the caller rather than returned from here:
 * returning a ref would make the caller's reads of left/top count as "accessing a ref during render" (react-hooks/refs).
 */
export function useAnchoredMenu(
  /** Anchor's position in the document; null means the menu is closed and nothing needs measuring */
  from: number | null,
  viewRef: React.RefObject<EditorView | null>,
  /** Overlay root node: for measuring width and height */
  rootRef: React.RefObject<HTMLElement | null>,
  /** The editor's scroll container: recompute the position on scroll */
  scrollEl: HTMLElement | null,
  /** Fallback width before the first frame is measured (matches the menu's Tailwind width) */
  fallbackWidth: number
) {
  const [pos, setPos] = useState<{ from: number; left: number; top: number } | null>(null);

  const place = useCallback(
    (at: number) => {
      const view = viewRef.current;
      const el = rootRef.current;
      if (!view || !el) return;
      const c = view.coordsAtPos(at);
      if (!c) return;
      const w = el.offsetWidth || fallbackWidth;
      const h = el.offsetHeight || 0;
      // Must not overflow the editor column horizontally; clamp to the edge if it would (same as the floating toolbar)
      const col = view.dom.getBoundingClientRect();
      const min = col.left + EDGE;
      const max = Math.max(min, col.right - w - EDGE);
      const below = c.bottom + GAP;
      const flip = below + h > window.innerHeight - EDGE;
      setPos({
        from: at,
        left: Math.round(Math.min(Math.max(c.left, min), max)),
        top: Math.round(flip ? Math.max(EDGE, c.top - GAP - h) : below),
      });
    },
    [viewRef, rootRef, fallbackWidth]
  );

  // Layout side effects finish before paint: the menu won't flash at the old position before jumping under the cursor
  useLayoutEffect(() => {
    if (from !== null) place(from);
  }, [from, place]);

  // Coalesce with rAF so not every scroll event triggers a measurement
  useEffect(() => {
    if (from === null) return;
    let raf = 0;
    const onMove = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        place(from);
      });
    };
    scrollEl?.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      scrollEl?.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
    };
  }, [from, scrollEl, place]);

  return {
    left: pos?.left ?? 0,
    top: pos?.top ?? 0,
    /** Stay hidden until the position for this anchor is measured, to avoid the first frame flashing at (0,0) or the previous position */
    visible: from !== null && pos?.from === from,
  };
}
