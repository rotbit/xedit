import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { adminSessionUserId, isAdminEmail } from "@/lib/admin";
import { DEFAULT_STORAGE_QUOTA, storageUsed } from "@/lib/guards";
import { ossConfigured, ossDeleteMany } from "@/lib/oss";

type Params = { params: Promise<{ id: string }> };

/** 单账号配额上限（1TB）：挡住手滑输入的天文数字 */
const MAX_QUOTA = 1024 ** 4;

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
      bannedAt: true,
      banReason: true,
      storageQuota: true,
      passwordHash: true,
      accounts: { select: { provider: true } },
    },
  });
  if (!user) return notFound();

  const [used, docCount, trashCount, assetCount, docs, assets] = await Promise.all([
    storageUsed(id),
    prisma.document.count({ where: { userId: id, deletedAt: null } }),
    prisma.document.count({ where: { userId: id, deletedAt: { not: null } } }),
    prisma.asset.count({ where: { userId: id } }),
    prisma.document.findMany({
      where: { userId: id },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, title: true, category: true, updatedAt: true, deletedAt: true },
    }),
    prisma.asset.findMany({
      where: { userId: id },
      orderBy: { size: "desc" },
      take: 200,
      select: { id: true, url: true, size: true, mime: true, source: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      createdAt: user.createdAt,
      bannedAt: user.bannedAt,
      banReason: user.banReason,
      storageQuota: user.storageQuota == null ? null : Number(user.storageQuota),
      admin: isAdminEmail(user.email),
      // 登录方式：OAuth 平台名 + 是否设了密码
      logins: [...user.accounts.map((a) => a.provider), ...(user.passwordHash ? ["密码"] : [])],
    },
    totals: { docCount, trashCount, assetCount, storageUsed: used, defaultQuota: DEFAULT_STORAGE_QUOTA },
    docs,
    assets,
  });
}

/** 封禁/解封、调整存储配额（配额单位字节；null=恢复默认，0=不限制） */
export async function PATCH(req: Request, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!target) return notFound();

  const body = await req.json().catch(() => ({}));
  const data: { bannedAt?: Date | null; banReason?: string | null; storageQuota?: bigint | null } = {};

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

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "没有要修改的字段" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, bannedAt: true, banReason: true, storageQuota: true },
  });
  return NextResponse.json({
    id: updated.id,
    bannedAt: updated.bannedAt,
    banReason: updated.banReason,
    storageQuota: updated.storageQuota == null ? null : Number(updated.storageQuota),
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
