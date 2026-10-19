"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Broadcast channel from the editor for "which line is at the top of the viewport"; the outline panel uses it to highlight the current section.
 *
 * Why not lift it into state: setState on every scroll re-renders the whole article view (editor, title, word count...),
 * which costs far more than the highlight itself. Here the line number is pushed to subscribers to handle themselves,
 * the same approach as selection reporting (ArticleReader's selectionSubRef) and the floating menu channel.
 */
export type SubscribeTopLine = (cb: (line: number) => void) => () => void;

export function useTopLineChannel() {
  const subsRef = useRef(new Set<(line: number) => void>());
  const lineRef = useRef(0);

  const publish = useCallback((line: number) => {
    lineRef.current = line;
    for (const cb of subsRef.current) cb(line);
  }, []);

  const subscribe = useCallback<SubscribeTopLine>((cb) => {
    subsRef.current.add(cb);
    cb(lineRef.current); // Replay the current value on subscribe, so a panel expanded later lights up without waiting for the next scroll
    return () => {
      subsRef.current.delete(cb);
    };
  }, []);

  return { publish, subscribe };
}

/**
 * Lead for the top line (in lines): a heading that just reached the viewport top should count as entering that section.
 * It also compensates for the outline jump's 12px margin -- after jumping, the heading top is still 12px below the container top,
 * so the top line lands on the line before the heading, and without slack the highlight would be one section off.
 */
const LOOKAHEAD_LINES = 2;

/** After this long between scroll reports, the smooth scroll from a jump is considered done and the user is scrolling on their own */
const PIN_QUIET_MS = 300;

/** Section at the viewport top = the last heading whose start line is at or above the top line; -1 if still before the first heading */
function findActive(headings: readonly { line: number }[], topLine: number): number {
  const limit = topLine + LOOKAHEAD_LINES;
  let index = -1;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].line > limit) break; // headings are sorted by line ascending, so stop once past it
    index = i;
  }
  return index;
}

/**
 * Subscribes to the top line number and computes the current section's index in the outline.
 * Only calls setState when the index actually changes, so scrolling through a long section usually doesn't re-render at all.
 *
 * @param active Pass false when the panel is collapsed: no subscription, no computation
 */
export function useActiveHeading(
  headings: readonly { line: number }[],
  subscribe: SubscribeTopLine | undefined,
  active: boolean
): { index: number; pin: (index: number) => void } {
  const [index, setIndex] = useState(-1);
  const indexRef = useRef(-1);
  /** The item pinned by clicking the outline; last is the time of the latest scroll report */
  const pinRef = useRef<{ last: number } | null>(null);

  const apply = useCallback((next: number) => {
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
  }, []);

  /**
   * Whatever item was clicked gets highlighted. Headings at the end of the doc, or very short sections, can't scroll to the viewport top,
   * so judging by the top line alone they'd never light up, and clicking would seem to do nothing.
   */
  const pin = useCallback(
    (next: number) => {
      pinRef.current = { last: performance.now() };
      apply(next);
    },
    [apply]
  );

  useEffect(() => {
    if (!active || !subscribe) {
      apply(-1);
      return;
    }
    // Also recompute when headings change (a heading was edited): subscribing replays the current value, so resubscribing handles it
    return subscribe((line) => {
      const pinned = pinRef.current;
      if (pinned) {
        // Scroll reports during the jump's smooth scroll come back to back (one frame apart), so ignore them all;
        // one that arrives after a pause is the user scrolling, so release the pin and go back to position-based computation
        const now = performance.now();
        if (now - pinned.last < PIN_QUIET_MS) {
          pinned.last = now;
          return;
        }
        pinRef.current = null;
      }
      apply(findActive(headings, line));
    });
  }, [active, subscribe, headings, apply]);

  return { index, pin };
}
