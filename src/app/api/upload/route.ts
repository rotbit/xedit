import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ossConfigured, ossPut } from "@/lib/oss";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

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
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "图片不能超过 10MB" }, { status: 413 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: `不支持的图片类型: ${file.type}` }, { status: 415 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await ossPut(buffer, ext, file.type);
    return NextResponse.json({ url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "上传失败";
    return NextResponse.json({ error: `OSS 上传失败: ${message}` }, { status: 502 });
  }
}
