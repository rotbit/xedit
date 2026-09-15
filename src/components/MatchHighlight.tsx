"use client";

/**
 * 按命中区间给一段文本套高亮（快速切换器用）。
 * 区间由 docSearch.matchRanges 保证有序且不重叠。
 *
 * 选中行本身就是 accent-wash 底，高亮块压上去没了色差，
 * 所以另加一档字重把命中词托起来。
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
