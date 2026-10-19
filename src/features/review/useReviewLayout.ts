"use client";

/**
 * Layout dimensions for review mode: how wide the body column is, and whether the comment column fits.
 *
 * The first rule: "the body column gives up not a single pixel". The previous version narrowed the editor to make room for comments,
 * leaving the author's writing area more cramped than the comment area. Now the body column stays at 760,
 * and the pair (body + comment column) is centered as a whole, so the body just shifts slightly left.
 *
 * When the container really can't fit the pair (small window, outline open), skip the column: instead,
 * whichever comment is selected floats as a card under its sentence.
 */

import { useEffect, useState } from "react";

/** Body column width (matches max-width: 760px of .cm-doc in editor.css; do not change) */
export const ARTICLE_WIDTH = 760;
/** Comment column width */
export const CARD_COL_WIDTH = 260;
/** Gap between body and comment column, also the minimum gap between cards */
export const CARD_GAP = 16;
/** Net container width needed to fit the comment column */
export const REVIEW_MIN_WIDTH = ARTICLE_WIDTH + CARD_GAP + CARD_COL_WIDTH;

/**
 * Watch the scroll container's width to decide whether to show the comment column.
 * Toggling the outline panel and resizing the window both change this width; ResizeObserver catches both.
 */
export function useReviewLayout({
  active,
  scrollEl,
}: {
  active: boolean;
  /** Shared scroll container for title + body */
  scrollEl: HTMLElement | null;
}): { showColumn: boolean; width: number } {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!active || !scrollEl) return;
    // No separate synchronous read: after observe, ResizeObserver fires once before the first paint
    const ro = new ResizeObserver(() => setWidth(scrollEl.clientWidth));
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, [active, scrollEl]);

  // Until measured, assume it fits: if it's actually narrow, it just shows for one frame and then collapses,
  // whereas the reverse (popover first, then column) looks like the UI twitching on its own
  return { showColumn: active && (width === 0 || width >= REVIEW_MIN_WIDTH), width };
}
