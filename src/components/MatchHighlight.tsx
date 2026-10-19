"use client";

/**
 * Highlights a piece of text by match ranges (used by the quick switcher).
 * docSearch.matchRanges guarantees the ranges are sorted and non-overlapping.
 *
 * The selected row already has an accent-wash background, so a highlight block on top loses contrast;
 * an extra font weight lifts the matched words instead.
 */
export function MatchHighlight({
  text,
  ranges,
}: {
  text: string;
  ranges: [number, number][];
}) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const [start, end] of ranges) {
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <span
        key={start}
        className="rounded-sm bg-[var(--accent-wash)] font-medium text-[var(--accent-deep)]"
      >
        {text.slice(start, end)}
      </span>
    );
    last = end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
