import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ossConfigured,
  ossObjectKey,
  ossSignedPutUrl,
  ossStat,
  ossUrlOf,
  OSS_KEY_PATTERN,
} from "@/lib/oss";
import { MEDIA_EXT, MIME_BY_EXT, maxSizeOf, sizeLimitError } from "@/lib/media";
import { prisma } from "@/lib/prisma";

/**
 * 浏览器直传 OSS 的两步接口：
 *   POST 换一个限时签名地址（文件本身不经过本服务）
 *   PUT  直传成功后回来登记入库（用 head 向 OSS 确认对象确实存在）
 * 需要在 Bucket 的跨域设置里放行本站来源的 PUT 与 Content-Type 头；
 * 没配的话前端会自动回落到 /api/upload 中转（仅图片；视频只能直传）。
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
  const ext = MEDIA_EXT[mime];
  if (!ext) return NextResponse.json({ error: `不支持的文件类型: ${mime}` }, { status: 415 });
  if (size > maxSizeOf(mime)) {
    return NextResponse.json({ error: sizeLimitError(mime) }, { status: 413 });
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
  if (!stat) return NextResponse.json({ error: "文件未上传成功" }, { status: 404 });
  // 大小按对象实际类型限额：签名时校过声明值，这里再校 OSS 里的真实值
  const mime = stat.mime || MIME_BY_EXT[key.split(".").pop() ?? ""] || "";
  if (stat.size > maxSizeOf(mime)) {
    return NextResponse.json({ error: sizeLimitError(mime) }, { status: 413 });
  }

  const url = ossUrlOf(key);
  await prisma.asset.upsert({
    where: { userId_key: { userId, key } },
    update: { url, size: stat.size, mime: stat.mime },
    create: { userId, key, url, size: stat.size, mime: stat.mime },
  });
  return NextResponse.json({ url });
}
