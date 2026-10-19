/**
 * A bit of color math for review.
 *
 * Category colors are hex values sent by the server with the result (see types.ts); the frontend doesn't hardcode the categories,
 * so background and underline colors for light and dark themes must be computed: by day just use a pale background, by night brighten the color a step first,
 * otherwise a dark color like #d93025 is nearly invisible on a #1b1b1c panel.
 */

/** #rrggbb → [r, g, b]; returns null if unrecognized */
function parse(hex: string): [number, number, number] | null {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** #rrggbb → rgba(), for a pale background under the underline */
export function tint(hex: string, alpha: number): string {
  const rgb = parse(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** Mix toward white: amount = 0 is the original color, 1 is pure white. Used at night to brighten category colors.
    Still returns #rrggbb so tint can keep computing from it */
export function lighten(hex: string, amount: number): string {
  const rgb = parse(hex);
  if (!rgb) return hex;
  const to = (v: number) =>
    Math.round(v + (255 - v) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`;
}
