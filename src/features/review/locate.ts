/**
 * Pure functions for "aligning" review comments: finding quotes in the source, and the collision-avoiding layout of comment cards.
 *
 * Why always search by quote text instead of storing character offsets: comments are computed asynchronously, and by the time they return the author may
 * have edited a few characters elsewhere, invalidating any offset; whereas as long as the quote is still there, the author knows at a glance which sentence it means.
 * line is only a hint (when the same sentence appears several times, pick the nearest occurrence); if not found, fall back to a full-text search.
 */

export interface SourceSpan {
  from: number;
  to: number;
}

/**
 * Find a quote in the Markdown source and return its character range; returns null if not found (= the original was edited).
 *
 * When the text occurs several times, take the one nearest lineHint. Line numbers are counted while scanning:
 * each step only counts newlines onward from the previous match, so the whole doc is walked at most once rather than recounting it per hit.
 *
 * @param lineHint 0-based line number, same convention as data-line in the rendered output
 */
export function locateInSource(source: string, quote: string, lineHint: number): SourceSpan | null {
  if (!quote) return null;
  let best: SourceSpan | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  let scanned = 0;
  let line = 0;
  for (let at = source.indexOf(quote); at !== -1; at = source.indexOf(quote, at + 1)) {
    while (scanned < at) {
      if (source.charCodeAt(scanned) === 10) line++;
      scanned++;
    }
    const dist = Math.abs(line - lineHint);
    if (dist < bestDist) {
      bestDist = dist;
      best = { from: at, to: at + quote.length };
    }
    if (dist === 0) break; // Right on the hint line; nothing can be closer
  }
  return best;
}

/**
 * Collision-avoiding layout for comment cards (like Word's comment pane).
 *
 * Every card wants to sit at its quote's height, and moves down if there's no room:
 * - normally later cards get pushed down by earlier ones, order unchanged;
 * - the selected card is privileged: it returns to its own anchor and the cards above squeeze upward to make room;
 * - if there's truly no room above (hit 0), the selected card has to move down too; not enough space is not enough space.
 *
 * @param anchors where each card wants to sit (relative to the top of the card column)
 * @param heights each card's actual height, matching anchors one to one
 * @param active  index of the selected card, -1 if none
 * @param gap     minimum gap between cards
 */
export function layoutCards(
  anchors: number[],
  heights: number[],
  active: number,
  gap: number
): number[] {
  const n = anchors.length;
  if (n === 0) return [];
  const tops = anchors.map((t) => Math.max(0, t));

  /** Flatten overlaps going downward from `from` */
  const pushDown = (from: number) => {
    for (let i = Math.max(1, from); i < n; i++) {
      tops[i] = Math.max(tops[i], tops[i - 1] + heights[i - 1] + gap);
    }
  };
  pushDown(1);
  if (active < 0 || active >= n) return tops;

  tops[active] = Math.max(0, anchors[active]);
  for (let i = active - 1; i >= 0; i--) {
    tops[i] = Math.min(tops[i], tops[i + 1] - heights[i] - gap);
  }
  if (tops[0] < 0) {
    // The space above can't be freed: reset the top to 0 and push down again in order (the selected card gets pushed down too)
    tops[0] = 0;
    pushDown(1);
  } else {
    for (let i = active + 1; i < n; i++) {
      tops[i] = Math.max(Math.max(0, anchors[i]), tops[i - 1] + heights[i - 1] + gap);
    }
  }
  return tops;
}
