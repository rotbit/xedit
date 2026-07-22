import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ossConfigured,
  ossObjectKey,
  ossSignedPutUrl,
  ossStat,
  ossUrlOf,
  IMAGE_EXT,
  MAX_IMAGE_SIZE,
  OSS_KEY_PATTERN,
} from "@/lib/oss";
import { prisma } from "@/lib/prisma";

/**
 * 浏览器直传 OSS 的两步接口：
 *   POST 换一个限时签名地址（图片本身不经过本服务）
 *   PUT  直传成功后回来登记入库（用 head 向 OSS 确认对象确实存在）
 * 需要在 Bucket 的跨域设置里放行本站来源的 PUT 与 Content-Type 头；
 * 没配的话前端会自动回落到 /api/upload 中转。
 */

async function requireUser() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function POST(req: Request) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "请先登录再使用图床" }, { status: 401 });
  if (!ossConfigured()) {
    return NextResponse.json({ error: "服务端未配置阿里云 OSS" }, { status: 501 });
  }

  const body = await req.json().catch(() => ({}));
  const mime = typeof body?.mime === "string" ? body.mime : "";
  const size = typeof body?.size === "number" ? body.size : 0;
  const ext = IMAGE_EXT[mime];
  if (!ext) return NextResponse.json({ error: `不支持的图片类型: ${mime}` }, { status: 415 });
  if (size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: "图片不能超过 10MB" }, { status: 413 });
  }

  const key = ossObjectKey(ext);
  return NextResponse.json({ key, uploadUrl: ossSignedPutUrl(key, mime), url: ossUrlOf(key) });
}

export async function PUT(req: Request) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "请先登录再使用图床" }, { status: 401 });
  if (!ossConfigured()) {
    return NextResponse.json({ error: "服务端未配置阿里云 OSS" }, { status: 501 });
  }

  const body = await req.json().catch(() => ({}));
  const key = typeof body?.key === "string" ? body.key : "";
  if (!OSS_KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: "非法的对象名" }, { status: 400 });
  }

  const stat = await ossStat(key);
  if (!stat) return NextResponse.json({ error: "图片未上传成功" }, { status: 404 });
  if (stat.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: "图片不能超过 10MB" }, { status: 413 });
  }

  const url = ossUrlOf(key);
  await prisma.asset.upsert({
    where: { userId_key: { userId, key } },
    update: { url, size: stat.size, mime: stat.mime },
    create: { userId, key, url, size: stat.size, mime: stat.mime },
  });
  return NextResponse.json({ url });
}
