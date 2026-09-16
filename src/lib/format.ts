// 时间戳的展示格式。相对时间与绝对时间是两种口径，别硬合成一个函数：
// 列表里要「刚刚 / 3 分钟前」这种口语化的近期感，详情/版本里要能对得上的确切时刻。

/** 无效日期统一显示成这个，比 "NaN/NaN" 好看 */
const INVALID = "—";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 列表时间戳的口语化展示：一天内走相对时间，更早显示日期 */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 绝对时刻「[年/]月/日 时:分」。两个可选项表达调用方的差异：
 * - omitCurrentYear：今年的省掉年份（版本列表里同年条目居多，年份纯噪音）
 * - pad：月/日补零成两位（信息面板里要与上下行对齐）
 * 时:分始终补零。
 */
export function formatDateTime(
  iso: string,
  opts: { omitCurrentYear?: boolean; pad?: boolean } = {}
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return INVALID;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year =
    opts.omitCurrentYear && d.getFullYear() === new Date().getFullYear()
      ? ""
      : `${d.getFullYear()}/`;
  const md = opts.pad ? `${pad2(month)}/${pad2(day)}` : `${month}/${day}`;
  return `${year}${md} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 字节数的人话展示。配额提示（服务端）与后台面板（客户端）共用，两处口径必须一致 */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
