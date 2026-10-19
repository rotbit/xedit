import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ossConfigured, ossPut } from "@/lib/oss";
import { IMAGE_EXT, MAX_IMAGE_SIZE, isVideoMime, parseImageDimensions } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { uploadBlocked } from "@/lib/guards";
import { serverError } from "@/lib/routeAuth";
import { tk, translate } from "@/i18n/t";
import { localeOfRequest } from "@/i18n/server";

/** Server-relayed upload: fallback when direct upload isn't available (e.g. the bucket lacks CORS).
 *  Images only: videos are large, relaying would read them fully into memory and hit the body size limit, so they go direct only. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("请先登录再使用图床") }, { status: 401 });
  }
  if (!ossConfigured()) {
    return NextResponse.json(
      { error: tk("服务端未配置阿里云 OSS，请在 .env 中填写 OSS_* 变量") },
      { status: 501 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: tk("缺少文件") }, { status: 400 });
  }
  if (isVideoMime(file.type)) {
    return NextResponse.json(
      { error: tk("视频仅支持浏览器直传，请确认 OSS Bucket 已配置跨域（CORS）") },
      { status: 415 }
    );
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: tk("图片不能超过 10MB") }, { status: 413 });
  }
  const ext = IMAGE_EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: translate("不支持的图片类型: {type}", localeOfRequest(req), { type: file.type }) }, { status: 415 });
  }
  const blocked = await uploadBlocked(session.user.id, file.size);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });

  // Pixel dimensions read by the browser, sent with the FormData; if missing or invalid, leave empty and backfill when the frontend displays it
  const dims = parseImageDimensions(formData.get("width"), formData.get("height"));
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, key } = await ossPut(buffer, ext, file.type);
    await prisma.asset.create({
      data: {
        userId: session.user.id,
        key,
        url,
        size: file.size,
        mime: file.type,
        ...(dims ?? {}),
      },
    });
    return NextResponse.json({ url });
  } catch (e) {
    // OSS errors often include bucket / endpoint / requestId, which shouldn't go back to the browser
    return serverError(e, tk("上传失败，请稍后重试"));
  }
}
