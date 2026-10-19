import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { PERMISSIONS, knownPermissions, type Permission } from "@/lib/permissionKeys";

/**
 * Per-account feature permissions: the decision rules live only here.
 * Admins (ADMIN_EMAILS) get everything; banned users get nothing (a ban already leaves only viewing and export, let alone anything costing the site money);
 * everyone else gets what User.permissions stores, and new users start with none.
 * Always queried fresh, not put in the JWT: revoking a permission in the admin must take effect immediately, not when the session expires.
 * This file doesn't import "@/auth"; like lib/admin, callers pass the session in themselves.
 */

const ALL: Permission[] = PERMISSIONS.map((p) => p.key);

/** Per-permission daily quota column; empty = use the global default, which each endpoint applies itself */
const LIMIT_COLUMN = {
  ai_review: "aiReviewDailyLimit",
  ai_cover: "aiCoverDailyLimit",
} as const satisfies Record<Permission, string>;

type PermissionRow = { email: string | null; bannedAt: Date | null; permissions: string[] };

/** Pure function: one user row → effective permissions */
export function resolvePermissions(u: PermissionRow): Permission[] {
  if (u.bannedAt) return [];
  if (isAdminEmail(u.email)) return [...ALL];
  return knownPermissions(u.permissions);
}

/** Effective permissions of the current session's account; empty if not logged in or the account no longer exists */
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
 * Endpoint guard: if the session account has this permission, return userId and its own daily quota (null if unset; callers fall back to the global default),
 * else null. The email comes from the database, not trusted from the session.
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
