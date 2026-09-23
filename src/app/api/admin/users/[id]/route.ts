/**
 * 后台单账号接口：明细（GET）、封禁 / 配额 / 功能权限与每日额度（PATCH）、删号（DELETE）。
 * 三个方法都先过 requireAdmin；管理员账号本身不允许被封禁或删除，免得把自己锁在门外。
 * 存储配额在库里是 BigInt，进出这层都要和 number 互转（见各处 Number() / BigInt()）。
 * 权限这里读写的是库里存的原值；管理员全开、封禁全关是在 lib/permissions 判定时才叠上去的。
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

type Params = { params: Promise<{ id: string }> };

/** 单账号配额上限（1TB）：挡住手滑输入的天文数字 */
const MAX_QUOTA = 1024 ** 4;

/** 单账号每日 AI 次数上限：挡住手滑，也挡住「填个天文数字当不限」 */
const MAX_DAILY_LIMIT = 10000;

/** 每日额度：null = 回到全局默认；1..10000 的整数照收；其余返回 undefined 让调用方报 400 */
function cleanDailyLimit(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_DAILY_LIMIT) return v;
  return undefined;
}

async function requireAdmin() {
  const session = await auth();
  return adminSessionUserId(session);
}

const forbidden = () => NextResponse.json({ error: "无权访问" }, { status: 403 });
const notFound = () => NextResponse.json({ error: "账号不存在" }, { status: 404 });

/** 账号明细：基本信息 + 文档列表 + 按体积排序的素材清单 */
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
      // 文档、素材都只取前若干条：这个接口是给人看的明细页，不是导出工具，不做分页也不求全
      take: 100,
      select: { id: true, title: true, category: true, updatedAt: true, deletedAt: true },
    }),
    prisma.asset.findMany({
      where: { userId: id },
      orderBy: { size: "desc" },
      take: 200,
      select: { id: true, url: true, size: true, mime: true, source: true, createdAt: true },
    }),
    // 最近活跃日期：DailyActive.date 是东八区 YYYY-MM-DD，字符串倒序即时间倒序
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
      // 登录方式：OAuth 平台名 + 是否设了密码
      logins: [...user.accounts.map((a) => a.provider), ...(user.passwordHash ? ["密码"] : [])],
    },
    totals: {
      docCount,
      trashCount,
      assetCount,
      storageUsed: used,
      defaultQuota: DEFAULT_STORAGE_QUOTA,
      // 单独额度留空时实际生效的全局默认，后台输入框拿来当占位提示
      defaultAiReviewDailyLimit: aiDailyLimit(),
      defaultAiCoverDailyLimit: coverDailyLimit(),
    },
    docs,
    assets,
  });
}

/**
 * 封禁/解封、调整存储配额（配额单位字节；null=恢复默认，0=不限制）、
 * 开关功能权限（整组覆盖）、单设 AI 审核 / 生成封面的每日额度（null=恢复默认）
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
      return NextResponse.json({ error: "管理员账号不能封禁" }, { status: 400 });
    }
    data.bannedAt = body.banned ? new Date() : null;
    data.banReason =
      body.banned && typeof body.banReason === "string" && body.banReason.trim()
        ? body.banReason.trim().slice(0, 200)
        : null;
  }

  if ("storageQuota" in body) {
    if (body.storageQuota === null) {
      // null = 回到全局默认配额，0 = 明确不限制。两者含义不同，不能合并成一个
      data.storageQuota = null;
    } else if (typeof body.storageQuota === "number" && Number.isFinite(body.storageQuota)) {
      const bytes = Math.round(body.storageQuota);
      if (bytes < 0 || bytes > MAX_QUOTA) {
        return NextResponse.json({ error: "配额需在 0 到 1TB 之间" }, { status: 400 });
      }
      data.storageQuota = BigInt(bytes);
    } else {
      return NextResponse.json({ error: "配额格式不正确" }, { status: 400 });
    }
  }

  if ("permissions" in body) {
    // 整组覆盖而不是增删：前端交上来的就是勾选框的全貌，混进认不出的 key 宁可报错也不静默吞掉
    const permissions = cleanPermissions(body.permissions);
    if (!permissions) return NextResponse.json({ error: "认不出这个权限" }, { status: 400 });
    data.permissions = permissions;
  }

  for (const field of ["aiReviewDailyLimit", "aiCoverDailyLimit"] as const) {
    if (!(field in body)) continue;
    const limit = cleanDailyLimit(body[field]);
    if (limit === undefined) {
      return NextResponse.json({ error: "每日次数需在 1 到 10000 之间" }, { status: 400 });
    }
    data[field] = limit;
  }

  // 一个可改字段都没命中就报错，而不是静默成功：否则前端会以为改上了
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "没有要修改的字段" }, { status: 400 });
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

/** 删除账号：先清 OSS 素材，再删用户行（文档/版本/设置/授权全部级联） */
export async function DELETE(_req: Request, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id } = await params;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { email: true, assets: { select: { key: true } } },
  });
  if (!target) return notFound();
  if (isAdminEmail(target.email)) {
    return NextResponse.json({ error: "管理员账号不能删除" }, { status: 400 });
  }

  // OSS 清理失败不阻断删号（对象可能已不存在），残留可再用「同步 OSS 历史」找回排查
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
