/** 万字以上折算成「x.x 万」，便于一眼读出量级 */
export function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  return String(n);
}

/** 热力色阶：未活跃 → 字数越多越深（色值随日夜模式切换） */
export function cellColor(cell: { chars: number; active: boolean }): string {
  if (!cell.active) return "var(--heat-0)";
  if (cell.chars <= 0) return "var(--heat-1)";
  if (cell.chars < 300) return "var(--heat-2)";
  if (cell.chars < 1000) return "var(--heat-3)";
  if (cell.chars < 3000) return "var(--heat-4)";
  return "var(--heat-5)";
}

export const CAT_COLORS = [
  "var(--cat-1)",
  "var(--cat-2)",
  "var(--cat-3)",
  "var(--cat-4)",
  "var(--cat-5)",
  "var(--cat-6)",
];

/** 累计字数的叙事化参照 */
export function narrative(chars: number): string {
  if (chars >= 120_000) return `体量已达 ${(chars / 120_000).toFixed(1)} 部《活着》`;
  if (chars >= 60_000) return `相当于 ${(chars / 60_000).toFixed(1)} 本《边城》`;
  if (chars >= 26_000) return "已超过一部《阿 Q 正传》的篇幅";
  if (chars >= 8_000) return "相当于一篇本科毕业论文";
  if (chars >= 2_000) return "已是一篇扎实的深度长文";
  if (chars > 0) return "每一个字，都算数";
  return "落笔，即是开始";
}

/** 热力图与趋势图同口径的周分列起点：getDay 0=周日 → 转成 0=周一 */
export function firstWeekdayOffset(firstDate: string): number {
  return (new Date(firstDate).getDay() + 6) % 7;
}
