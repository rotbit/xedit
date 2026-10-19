/**
 * Admin single-account API: details (GET), ban / quota / feature permissions and daily limits (PATCH), account deletion (DELETE).
 * All three methods go through requireAdmin first; admin accounts themselves can't be banned or deleted, so you can't lock yourself out.
 * Storage quota is a BigInt in the DB and must be converted to/from number at this layer (see the Number() / BigInt() calls).
 * Permissions here are the raw stored values; admin all-on and banned all-off are applied only when lib/permissions evaluates them.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { adminSessionUserId, isAdminEmail } from "@/lib/admin";
import { DEFAULT_STORAGE_QUOTA, storageUsed } from "@/lib/guards";
import { ossConfigured, ossDeleteMany } from "@/lib/oss";
import { cleanPermissions, knownPermissions, type Permission } from "@/lib/permissionKeys";
import { aiDailyLimit } from "@/lib/ai/limit";
import { coverDailyLimit } from "@/lib/coverGenerate/replicate";
import { tk } from "@/i18n/t";

type Params = { params: Promise<{ id: string }> };

/** Per-account quota cap (1TB): blocks astronomical numbers typed by accident */
const MAX_QUOTA = 1024 ** 4;

/** Per-account daily AI cap: blocks typos, and blocks "enter a huge number to mean unlimited" */
const MAX_DAILY_LIMIT = 10000;

/** Daily limit: null = back to the global default; integers 1..10000 are accepted; anything else returns undefined so the caller replies 400 */
function cleanDailyLimit(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_DAILY_LIMIT) return v;
  return undefined;
}

async function requireAdmin() {
  const session = await auth();
  return adminSessionUserId(session);
}

const forbidden = () => NextResponse.json({ error: tk("无权访问") }, { status: 403 });
const notFound = () => NextResponse.json({ error: tk("账号不存在") }, { status: 404 });

/** Account details: basic info + document list + assets sorted by size */
export async function GET(_req: Request, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      lastLoginAt: true,
      bannedAt: true,
      banReason: true,
      storageQuota: true,
      permissions: true,
      aiReviewDailyLimit: true,
      aiCoverDailyLimit: true,
      passwordHash: true,
      accounts: { select: { provider: true } },
    },
  });
  if (!user) return notFound();

  const [used, docCount, trashCount, assetCount, docs, assets, lastActive] = await Promise.all([
    storageUsed(id),
    prisma.document.count({ where: { userId: id, deletedAt: null } }),
    prisma.document.count({ where: { userId: id, deletedAt: { not: null } } }),
    prisma.asset.count({ where: { userId: id } }),
    prisma.document.findMany({
      where: { userId: id },
      orderBy: { updatedAt: "desc" },
      // Docs and assets are limited to the first N: this API is for a human-readable detail page, not an export tool, so no pagination or completeness
      take: 100,
      select: { id: true, title: true, category: true, updatedAt: true, deletedAt: true },
    }),
    prisma.asset.findMany({
      where: { userId: id },
      orderBy: { size: "desc" },
      take: 200,
      select: { id: true, url: true, size: true, mime: true, source: true, createdAt: true },
    }),
    // Last active date: DailyActive.date is YYYY-MM-DD in UTC+8, so descending string order is descending time order
    prisma.dailyActive.findFirst({
      where: { userId: id },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ]);

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      lastActiveDate: lastActive?.date ?? null,
      bannedAt: user.bannedAt,
      banReason: user.banReason,
      storageQuota: user.storageQuota == null ? null : Number(user.storageQuota),
      admin: isAdminEmail(user.email),
      permissions: knownPermissions(user.permissions),
      aiReviewDailyLimit: user.aiReviewDailyLimit,
      aiCoverDailyLimit: user.aiCoverDailyLimit,
      // Login methods: OAuth provider names + whether a password is set
      logins: [...user.accounts.map((a) => a.provider), ...(user.passwordHash ? [tk("密码")] : [])],
    },
    totals: {
      docCount,
      trashCount,
      assetCount,
      storageUsed: used,
      defaultQuota: DEFAULT_STORAGE_QUOTA,
      // The global default that applies when the per-account limit is empty; the admin input uses it as a placeholder
      defaultAiReviewDailyLimit: aiDailyLimit(),
      defaultAiCoverDailyLimit: coverDailyLimit(),
    },
    docs,
    assets,
  });
}

/**
 * Ban/unban, adjust storage quota (in bytes; null = restore default, 0 = unlimited),
 * toggle feature permissions (whole set replaced), set per-account daily limits for AI review / cover generation (null = restore default)
 */
export async function PATCH(req: Request, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!target) return notFound();

  const body = await req.json().catch(() => ({}));
  const data: {
    bannedAt?: Date | null;
    banReason?: string | null;
    storageQuota?: bigint | null;
    permissions?: Permission[];
    aiReviewDailyLimit?: number | null;
    aiCoverDailyLimit?: number | null;
  } = {};

  if (typeof body.banned === "boolean") {
    if (body.banned && isAdminEmail(target.email)) {
      return NextResponse.json({ error: tk("管理员账号不能封禁") }, { status: 400 });
    }
    data.bannedAt = body.banned ? new Date() : null;
    data.banReason =
      body.banned && typeof body.banReason === "string" && body.banReason.trim()
        ? body.banReason.trim().slice(0, 200)
        : null;
  }

  if ("storageQuota" in body) {
    if (body.storageQuota === null) {
      // null = back to the global default quota, 0 = explicitly unlimited. They mean different things and can't be merged
      data.storageQuota = null;
    } else if (typeof body.storageQuota === "number" && Number.isFinite(body.storageQuota)) {
      const bytes = Math.round(body.storageQuota);
      if (bytes < 0 || bytes > MAX_QUOTA) {
        return NextResponse.json({ error: tk("配额需在 0 到 1TB 之间") }, { status: 400 });
      }
      data.storageQuota = BigInt(bytes);
    } else {
      return NextResponse.json({ error: tk("配额格式不正确") }, { status: 400 });
    }
  }

  if ("permissions" in body) {
    // Replace the whole set rather than add/remove: the frontend sends the full checkbox state; an unrecognized key errors rather than being silently swallowed
    const permissions = cleanPermissions(body.permissions);
    if (!permissions) return NextResponse.json({ error: tk("认不出这个权限") }, { status: 400 });
    data.permissions = permissions;
  }

  for (const field of ["aiReviewDailyLimit", "aiCoverDailyLimit"] as const) {
    if (!(field in body)) continue;
    const limit = cleanDailyLimit(body[field]);
    if (limit === undefined) {
      return NextResponse.json({ error: tk("每日次数需在 1 到 10000 之间") }, { status: 400 });
    }
    data[field] = limit;
  }

  // Error if no editable field matched, rather than silently succeeding: otherwise the frontend would think the change applied
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: tk("没有要修改的字段") }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      bannedAt: true,
      banReason: true,
      storageQuota: true,
      permissions: true,
      aiReviewDailyLimit: true,
      aiCoverDailyLimit: true,
    },
  });
  return NextResponse.json({
    id: updated.id,
    bannedAt: updated.bannedAt,
    banReason: updated.banReason,
    storageQuota: updated.storageQuota == null ? null : Number(updated.storageQuota),
    permissions: knownPermissions(updated.permissions),
    aiReviewDailyLimit: updated.aiReviewDailyLimit,
    aiCoverDailyLimit: updated.aiCoverDailyLimit,
  });
}

/** Delete account: clear OSS assets first, then delete the user row (docs/versions/settings/authorizations all cascade) */
export async function DELETE(_req: Request, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id } = await params;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { email: true, assets: { select: { key: true } } },
  });
  if (!target) return notFound();
  if (isAdminEmail(target.email)) {
    return NextResponse.json({ error: tk("管理员账号不能删除") }, { status: 400 });
  }

  // An OSS cleanup failure doesn't block deletion (objects may already be gone); leftovers can be found via 「同步 OSS 历史」 (Sync OSS history)
  if (ossConfigured() && target.assets.length > 0) {
    try {
      await ossDeleteMany(target.assets.map((a) => a.key));
    } catch {
      /* ignore */
    }
  }
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true, deletedAssets: target.assets.length });
}
