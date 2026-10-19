import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ossConfigured,
  ossDelete,
  ossObjectKey,
  ossSignedPutUrl,
  ossStat,
  ossUrlOf,
  OSS_KEY_PATTERN,
} from "@/lib/oss";
import {
  MEDIA_EXT,
  MIME_BY_EXT,
  maxSizeOf,
  parseImageDimensions,
  sizeLimitError,
} from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { uploadBlocked } from "@/lib/guards";
import { tk, translate } from "@/i18n/t";
import { localeOfRequest } from "@/i18n/server";

/**
 * Two-step API for direct browser uploads to OSS:
 *   POST gets a time-limited signed URL (the file itself never passes through this service)
 *   PUT  registers it in the DB after a successful upload (using head to confirm the object really exists in OSS)
 * The bucket's CORS settings must allow PUT and the Content-Type header from this site's origin;
 * if not configured, the frontend falls back to /api/upload relay (images only; videos are direct only).
 */

async function requireUser() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function POST(req: Request) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: tk("请先登录再使用图床") }, { status: 401 });
  if (!ossConfigured()) {
    return NextResponse.json({ error: tk("服务端未配置阿里云 OSS") }, { status: 501 });
  }

  const body = await req.json().catch(() => ({}));
  const mime = typeof body?.mime === "string" ? body.mime : "";
  const size = typeof body?.size === "number" ? body.size : 0;
  const ext = MEDIA_EXT[mime];
  if (!ext) return NextResponse.json({ error: translate("不支持的文件类型: {type}", localeOfRequest(req), { type: mime }) }, { status: 415 });
  if (size > maxSizeOf(mime)) {
    return NextResponse.json({ error: sizeLimitError(mime) }, { status: 413 });
  }
  // Pre-check bans and quota against the declared size before signing, so users don't upload for nothing
  const blocked = await uploadBlocked(userId, size);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });

  const key = ossObjectKey(ext);
  return NextResponse.json({ key, uploadUrl: ossSignedPutUrl(key, mime), url: ossUrlOf(key) });
}

export async function PUT(req: Request) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: tk("请先登录再使用图床") }, { status: 401 });
  if (!ossConfigured()) {
    return NextResponse.json({ error: tk("服务端未配置阿里云 OSS") }, { status: 501 });
  }

  const body = await req.json().catch(() => ({}));
  const key = typeof body?.key === "string" ? body.key : "";
  if (!OSS_KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: tk("非法的对象名") }, { status: 400 });
  }

  const stat = await ossStat(key);
  if (!stat) return NextResponse.json({ error: tk("文件未上传成功") }, { status: 404 });
  // Size limit by the object's actual type: the declared value was checked at signing, here we check OSS's real value
  const mime = stat.mime || MIME_BY_EXT[key.split(".").pop() ?? ""] || "";
  if (stat.size > maxSizeOf(mime)) {
    return NextResponse.json({ error: sizeLimitError(mime) }, { status: 413 });
  }
  // Final check against OSS's real size at registration; if over, delete the just-uploaded object so no orphan file is left
  const blocked = await uploadBlocked(userId, stat.size);
  if (blocked) {
    try {
      await ossDelete(key);
    } catch {
      /* The object may already be gone */
    }
    return NextResponse.json({ error: blocked }, { status: 403 });
  }

  // Pixel dimensions read by the browser, optional; ignored if invalid, and update won't overwrite existing values
  const dims = parseImageDimensions(body?.width, body?.height);
  const url = ossUrlOf(key);
  await prisma.asset.upsert({
    where: { userId_key: { userId, key } },
    update: { url, size: stat.size, mime: stat.mime, ...(dims ?? {}) },
    create: { userId, key, url, size: stat.size, mime: stat.mime, ...(dims ?? {}) },
  });
  return NextResponse.json({ url });
}
