import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { PERMISSIONS, knownPermissions, type Permission } from "@/lib/permissionKeys";

/**
 * 按账号开通的功能权限：判定口径只在这一处。
 * 管理员（ADMIN_EMAILS）一律全开；被封禁的一律全关——封禁本来就只剩看和导出，花站点钱的更不给；
 * 其余看库里 User.permissions 存了什么，新用户默认一个都没有。
 * 每次都现查库，不进 JWT：后台撤销权限要立刻生效，不能等会话过期。
 * 此文件不 import "@/auth"，与 lib/admin 一样，调用方自己把 session 传进来。
 */

const ALL: Permission[] = PERMISSIONS.map((p) => p.key);

/** 每项权限对应的单独每日额度列；空 = 走全局默认，由各接口自己兜 */
const LIMIT_COLUMN = {
  ai_review: "aiReviewDailyLimit",
  ai_cover: "aiCoverDailyLimit",
} as const satisfies Record<Permission, string>;

type PermissionRow = { email: string | null; bannedAt: Date | null; permissions: string[] };

/** 纯函数：一行用户数据 → 实际生效的权限 */
export function resolvePermissions(u: PermissionRow): Permission[] {
  if (u.bannedAt) return [];
  if (isAdminEmail(u.email)) return [...ALL];
  return knownPermissions(u.permissions);
}

/** 当前会话的账号实际有哪些权限；没登录或账号已不存在都是空 */
export async function sessionPermissions(session: Session | null): Promise<Permission[]> {
  const id = session?.user?.id;
  if (!id) return [];
  const u = await prisma.user.findUnique({
    where: { id },
    select: { email: true, bannedAt: true, permissions: true },
  });
  return u ? resolvePermissions(u) : [];
}

/**
 * 接口守卫：会话账号有这项权限时返回 userId 和它的单独每日额度（没设为 null，调用方用全局默认兜），
 * 否则 null。邮箱以库里的为准，不信任会话里带的。
 */
export async function requirePermission(
  session: Session | null,
  perm: Permission
): Promise<{ userId: string; dailyLimit: number | null } | null> {
  const id = session?.user?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      email: true,
      bannedAt: true,
      permissions: true,
      aiReviewDailyLimit: true,
      aiCoverDailyLimit: true,
    },
  });
  if (!u || !resolvePermissions(u).includes(perm)) return null;
  return { userId: id, dailyLimit: u[LIMIT_COLUMN[perm]] ?? null };
}
