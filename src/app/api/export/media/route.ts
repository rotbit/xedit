import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { MAX_IMAGE_SIZE } from "@/lib/media";
import { tk, translate } from "@/i18n/t";
import { localeOfRequest } from "@/i18n/server";

/** Only proxy this service's image-hosting domains (CDN or direct bucket domain) so it can't become an open proxy */
function allowedHost(host: string): boolean {
  const cdn = process.env.OSS_CDN_DOMAIN;
  if (cdn) {
    try {
      if (new URL(cdn).host === host) return true;
    } catch {
      /* Ignore an invalid CDN domain config */
    }
  }
  const { OSS_BUCKET, OSS_REGION } = process.env;
  return Boolean(OSS_BUCKET && OSS_REGION && host === `${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com`);
}

/** Same-origin fallback for fetching image bytes on Word export: if image hosting lacks CORS, the browser's direct fetch is blocked */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("请先登录") }, { status: 401 });
  }
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: tk("无效地址") }, { status: 400 });
  }
  if (target.protocol !== "https:" || !allowedHost(target.host)) {
    return NextResponse.json({ error: tk("仅允许代理本站图床的媒体") }, { status: 403 });
  }

  try {
    const upstream = await fetch(target, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json({ error: translate("源站返回 {status}", localeOfRequest(req), { status: upstream.status }) }, { status: 502 });
    }
    const type = upstream.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      return NextResponse.json({ error: tk("仅支持图片") }, { status: 415 });
    }
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: tk("图片过大") }, { status: 413 });
    }
    return new NextResponse(buf, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: tk("拉取媒体失败") }, { status: 502 });
  }
}
