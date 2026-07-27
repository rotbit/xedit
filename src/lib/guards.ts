import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 写操作守卫：只读封禁与存储配额（后台管理的执行端）。
 * 会话是 JWT 不落库，封不掉已登录的人，所以必须在每个写入口查库拦截；
 * REST 路由与 MCP 工具是两条独立通道，都要经过这里，行为才不漂移。
 */

/** 全局默认存储配额（字节，默认 10GB）；可用 DEFAULT_STORAGE_QUOTA_MB 覆盖。单账号的 User.storageQuota 优先，0 表示不限。 */
export const DEFAULT_STORAGE_QUOTA = (() => {
  const mb = Number(process.env.DEFAULT_STORAGE_QUOTA_MB);
  return Number.isFinite(mb) && mb >= 0 ? mb * 1024 * 1024 : 10 * 1024 * 1024 * 1024;
})();

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function readOnlyMsg(reason: string | null): string {
  return reason
    ? `账号已被限制为只读（${reason}），仅可查看与导出`
    : "账号已被限制为只读，仅可查看与导出";
}

/** 账号处于只读封禁时返回提示文案，否则 null */
export async function writeBlocked(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannedAt: true, banReason: true },
  });
  return user?.bannedAt ? readOnlyMsg(user.banReason) : null;
}

/** REST 便捷封装：被封禁时直接得到 403 响应 */
export async function readOnlyGuard(userId: string): Promise<NextResponse | null> {
  const msg = await writeBlocked(userId);
  return msg ? NextResponse.json({ error: msg }, { status: 403 }) : null;
}

/** 账号生效的配额（字节）；0 = 不限制 */
export function quotaOf(storageQuota: bigint | null): number {
  return storageQuota == null ? DEFAULT_STORAGE_QUOTA : Number(storageQuota);
}

/** 已用存储 = Asset.size 汇总 */
export async function storageUsed(userId: string): Promise<number> {
  const agg = await prisma.asset.aggregate({ where: { userId }, _sum: { size: true } });
  return agg._sum.size ?? 0;
}

/** 上传守卫：封禁与配额一起查。放行返回 null，否则返回给用户看的文案 */
export async function uploadBlocked(userId: string, incomingBytes: number): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannedAt: true, banReason: true, storageQuota: true },
  });
  if (!user) return "账号不存在";
  if (user.bannedAt) return readOnlyMsg(user.banReason);
  const quota = quotaOf(user.storageQuota);
  if (quota <= 0) return null;
  const used = await storageUsed(userId);
  if (used + Math.max(0, incomingBytes) > quota) {
    return `存储空间不足：已用 ${formatBytes(used)}，配额 ${formatBytes(quota)}，请清理素材或联系管理员`;
  }
  return null;
}
