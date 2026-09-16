/** 后台展示用的格式化小工具（客户端安全） */

// 字节格式化与服务端的配额提示共用一份实现；这里转出去，后台各处照旧从 "./format" 取
import { formatBytes } from "@/lib/format";

export { formatBytes };

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
