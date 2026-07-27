/** 后台展示用的格式化小工具（客户端安全） */

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 配额展示：null=默认值托底，0=不限制 */
export function quotaLabel(quota: number | null, defaultQuota: number): string {
  if (quota === null) return `${formatBytes(defaultQuota)}（默认）`;
  if (quota === 0) return "不限制";
  return formatBytes(quota);
}

/** 用量占比（%），配额不限时恒为 0 */
export function usagePercent(used: number, quota: number | null, defaultQuota: number): number {
  const limit = quota === null ? defaultQuota : quota;
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}
