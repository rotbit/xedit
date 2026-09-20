/**
 * 审核用到的一点颜色换算。
 *
 * 分类色是「服务端」随结果给的十六进制值（见 types.ts），前端不写死有哪几类，
 * 于是深浅两套主题下的底色、下划线色都得现算：日间直接配淡底，夜里先把色提亮一档，
 * 否则 #d93025 这种深色压在 #1b1b1c 的面板上几乎看不见。
 */

/** #rrggbb → [r, g, b]；认不出来就返回 null */
function parse(hex: string): [number, number, number] | null {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** #rrggbb → rgba()，给下划线配一层淡底 */
export function tint(hex: string, alpha: number): string {
  const rgb = parse(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** 往白里兑：amount = 0 原色，1 纯白。夜间用来把分类色提亮。
    仍返回 #rrggbb，好让 tint 接着往下算 */
export function lighten(hex: string, amount: number): string {
  const rgb = parse(hex);
  if (!rgb) return hex;
  const to = (v: number) =>
    Math.round(v + (255 - v) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`;
}
