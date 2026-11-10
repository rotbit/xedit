import { readJsonBody } from "@/lib/security/requestBody";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ossConfigured, ossSignedPutUrl, ossStat, ossUrlOf } from "@/lib/oss";
import { VIDEO_EXT, maxSizeOf, sizeLimitError } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { reserveUpload, finishUpload, UPLOAD_TTL, UploadError } from "@/lib/uploadReservations";
import { takeRateLimit, tooManyRequests } from "@/lib/security/rateLimit";
import { tk } from "@/i18n/t";

/** Videos remain direct uploads; images go through the server so metadata is removed before public storage. */
export async function POST(req: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.json({ error: tk("请先登录再使用图床") }, { status: 401 });
  if (!ossConfigured()) return NextResponse.json({ error: tk("服务端未配置阿里云 OSS") }, { status: 501 });
  const retry = await takeRateLimit("upload-sign", userId, 60, 3600);
  if (retry) return tooManyRequests(retry);
  const body = await readJsonBody(req).catch(() => null);
  const mime = typeof body?.mime === "string" ? body.mime : "";
  const size = body?.size;
  // 501 also makes older image clients fall back to the safe server upload route.
  if (!Object.hasOwn(VIDEO_EXT, mime)) {
    return NextResponse.json({ error: tk("图片请使用服务端上传") }, { status: 501 });
  }
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0 || size > maxSizeOf(mime)) {
    return NextResponse.json({ error: sizeLimitError(mime) }, { status: 413 });
  }
  try {
    const reserved = await reserveUpload(userId, mime, size);
    const uploadUrl = await ossSignedPutUrl(reserved.key, mime, size, UPLOAD_TTL);
    return NextResponse.json({
      key: reserved.key, uploadUrl, url: ossUrlOf(reserved.key),
      headers: { "Content-Type": mime, "x-oss-forbid-overwrite": "true" },
    });
  } catch (error) { return uploadError(error); }
}

/** A key must already belong to this user before OSS is inspected, registered, or deleted. */
export async function PUT(req: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.json({ error: tk("请先登录再使用图床") }, { status: 401 });
  if (!ossConfigured()) return NextResponse.json({ error: tk("服务端未配置阿里云 OSS") }, { status: 501 });
  const body = await readJsonBody(req).catch(() => null);
  const key = typeof body?.key === "string" ? body.key : "";
  const reserved = await prisma.uploadReservation.findFirst({ where: { key, userId, state: "pending" } });
  if (!reserved) {
    const existing = await prisma.asset.findUnique({ where: { userId_key: { userId, key } } });
    if (existing) return NextResponse.json({ url: existing.url });
    return NextResponse.json({ error: tk("上传凭证不存在或不属于当前账号") }, { status: 404 });
  }
  const stat = await ossStat(key);
  if (!stat) return NextResponse.json({ error: tk("文件未上传成功") }, { status: 404 });
  try {
    const asset = await finishUpload(userId, key, stat.size, stat.mime, "upload", undefined, true);
    return NextResponse.json({ url: asset.url });
  } catch (error) { return uploadError(error); }
}

function uploadError(error: unknown) {
  return NextResponse.json({ error: error instanceof UploadError ? error.message : tk("上传失败，请稍后重试") }, {
    status: error instanceof UploadError ? error.status : 500,
  });
}
