import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { MAX_IMAGE_SIZE } from "@/lib/media";

/** 只允许代理本服务图床的域名（CDN 域名或 Bucket 直连域名），避免沦为开放代理 */
function allowedHost(host: string): boolean {
  const cdn = process.env.OSS_CDN_DOMAIN;
  if (cdn) {
    try {
      if (new URL(cdn).host === host) return true;
    } catch {
      /* CDN 域名配置非法则忽略 */
    }
  }
  const { OSS_BUCKET, OSS_REGION } = process.env;
  return Boolean(OSS_BUCKET && OSS_REGION && host === `${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com`);
}

/** 导出 Word 时拉取图片字节的同源兜底：图床未配 CORS 的话浏览器直连会被拦 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "无效地址" }, { status: 400 });
  }
  if (target.protocol !== "https:" || !allowedHost(target.host)) {
    return NextResponse.json({ error: "仅允许代理本站图床的媒体" }, { status: 403 });
  }

  try {
    const upstream = await fetch(target, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json({ error: `源站返回 ${upstream.status}` }, { status: 502 });
    }
    const type = upstream.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      return NextResponse.json({ error: "仅支持图片" }, { status: 415 });
    }
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: "图片过大" }, { status: 413 });
    }
    return new NextResponse(buf, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "拉取媒体失败" }, { status: 502 });
  }
}
