/** Formatting helpers for admin display (client-safe) */

// Byte formatting shares one implementation with the server's quota messages; re-exported here so admin code keeps importing from "./format"
import { formatBytes } from "@/lib/format";

export { formatBytes };

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** Quota display: null = falls back to the default, 0 = unlimited */
export function quotaLabel(quota: number | null, defaultQuota: number): string {
  if (quota === null) return `${formatBytes(defaultQuota)}（默认）`;
  if (quota === 0) return "不限制";
  return formatBytes(quota);
}

/** Usage percentage (%); always 0 when the quota is unlimited */
export function usagePercent(used: number, quota: number | null, defaultQuota: number): number {
  const limit = quota === null ? defaultQuota : quota;
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}
