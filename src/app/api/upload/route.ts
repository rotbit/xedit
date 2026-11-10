import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { uploadMediaBuffer } from "@/lib/assets";
import { IMAGE_EXT, MAX_IMAGE_SIZE, parseImageDimensions } from "@/lib/media";
import { readLimitedBody } from "@/lib/security/requestBody";
import { UploadError } from "@/lib/uploadReservations";
import { takeRateLimit, tooManyRequests } from "@/lib/security/rateLimit";
import { prisma } from "@/lib/prisma";
import { tk } from "@/i18n/t";

/** All image uploads share the metadata removal, ownership, and quota implementation used by MCP and Feishu. */
export async function POST(req: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.json({ error: tk("请先登录再使用图床") }, { status: 401 });
  const retry = await takeRateLimit("image-upload", userId, 120, 3600);
  if (retry) return tooManyRequests(retry);
  let form: FormData;
  try {
    // Bound the stream before formData() allocates buffers, including chunked multipart requests.
    const bytes = new Uint8Array(await readLimitedBody(req.body, MAX_IMAGE_SIZE + 64 * 1024));
    form = await new Response(bytes, { headers: { "Content-Type": req.headers.get("content-type") ?? "" } }).formData();
  } catch {
    return NextResponse.json({ error: tk("上传格式错误或图片超过 10MB") }, { status: 413 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || !Object.hasOwn(IMAGE_EXT, file.type)) {
    return NextResponse.json({ error: tk("不支持的图片内容") }, { status: 415 });
  }
  try {
    const asset = await uploadMediaBuffer(userId, Buffer.from(await file.arrayBuffer()), file.type, "upload");
    const dims = parseImageDimensions(form.get("width"), form.get("height"));
    if (dims) await prisma.asset.update({ where: { id: asset.id }, data: dims });
    return NextResponse.json({ url: asset.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof UploadError ? error.message : tk("上传失败，请稍后重试") }, {
      status: error instanceof UploadError ? error.status : 500,
    });
  }
}
