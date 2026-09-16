import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ossConfigured, ossPut } from "@/lib/oss";
import { IMAGE_EXT, MAX_IMAGE_SIZE, isVideoMime, parseImageDimensions } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { uploadBlocked } from "@/lib/guards";
import { serverError } from "@/lib/routeAuth";

/** 服务端中转上传：直传不可用（如 Bucket 未配 CORS）时的兜底通道。
 *  仅图片——视频体积大，中转要整个读进内存还会撞请求体上限，只走直传。 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录再使用图床" }, { status: 401 });
  }
  if (!ossConfigured()) {
    return NextResponse.json(
      { error: "服务端未配置阿里云 OSS，请在 .env 中填写 OSS_* 变量" },
      { status: 501 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }
  if (isVideoMime(file.type)) {
    return NextResponse.json(
      { error: "视频仅支持浏览器直传，请确认 OSS Bucket 已配置跨域（CORS）" },
      { status: 415 }
    );
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: "图片不能超过 10MB" }, { status: 413 });
  }
  const ext = IMAGE_EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: `不支持的图片类型: ${file.type}` }, { status: 415 });
  }
  const blocked = await uploadBlocked(session.user.id, file.size);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });

  // 浏览器读出的像素尺寸，随 FormData 带上来；缺失或不合法就留空，等前端展示时补录
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
    // OSS 的报错常带 bucket / endpoint / requestId，不该回给浏览器
    return serverError(e, "上传失败，请稍后重试");
  }
}
