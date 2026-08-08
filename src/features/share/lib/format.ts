// 分享页展示用的时间文案格式化（纯函数，从 SharedArticle 搬出）

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) +
    " " + d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
