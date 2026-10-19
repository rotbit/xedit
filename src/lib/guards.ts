import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatBytes } from "@/lib/format";
import { tk } from "@/i18n/t";

/**
 * Write guards: read-only bans and storage quotas (the enforcement side of the admin panel).
 * Sessions are JWTs not stored in the DB, so a logged-in user can't be kicked out; every write entry point must check the DB;
 * REST routes and MCP tools are two separate channels and both must go through here so behavior doesn't drift.
 */

/** Global default storage quota (bytes, 10GB by default); can be overridden with DEFAULT_STORAGE_QUOTA_MB. Per-account User.storageQuota takes precedence; 0 means unlimited. */
export const DEFAULT_STORAGE_QUOTA = (() => {
  const mb = Number(process.env.DEFAULT_STORAGE_QUOTA_MB);
  return Number.isFinite(mb) && mb >= 0 ? mb * 1024 * 1024 : 10 * 1024 * 1024 * 1024;
})();

function readOnlyMsg(reason: string | null): string {
  return reason
    ? `账号已被限制为只读（${reason}），仅可查看与导出` // i18n-ignore server error message with variables; client-side t() can't match it, keep Chinese for now
    : tk("账号已被限制为只读，仅可查看与导出");
}

/** Returns a message when the account is under a read-only ban, otherwise null */
export async function writeBlocked(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannedAt: true, banReason: true },
  });
  return user?.bannedAt ? readOnlyMsg(user.banReason) : null;
}

/** REST convenience wrapper: get a 403 response directly when banned */
export async function readOnlyGuard(userId: string): Promise<NextResponse | null> {
  const msg = await writeBlocked(userId);
  return msg ? NextResponse.json({ error: msg }, { status: 403 }) : null;
}

/** Effective quota for the account (bytes); 0 = unlimited */
export function quotaOf(storageQuota: bigint | null): number {
  return storageQuota == null ? DEFAULT_STORAGE_QUOTA : Number(storageQuota);
}

/** Storage used = sum of Asset.size */
export async function storageUsed(userId: string): Promise<number> {
  const agg = await prisma.asset.aggregate({ where: { userId }, _sum: { size: true } });
  return agg._sum.size ?? 0;
}

/** Upload guard: checks ban and quota together. Returns null to allow, otherwise a user-facing message */
export async function uploadBlocked(userId: string, incomingBytes: number): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannedAt: true, banReason: true, storageQuota: true },
  });
  if (!user) return tk("账号不存在");
  if (user.bannedAt) return readOnlyMsg(user.banReason);
  const quota = quotaOf(user.storageQuota);
  if (quota <= 0) return null;
  const used = await storageUsed(userId);
  if (used + Math.max(0, incomingBytes) > quota) {
    return `存储空间不足：已用 ${formatBytes(used)}，配额 ${formatBytes(quota)}，请清理素材或联系管理员`; // i18n-ignore server error message with variables; client-side t() can't match it, keep Chinese for now
  }
  return null;
}
