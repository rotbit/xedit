import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { publicOrigin } from "@/lib/oauth/config";
import { FEISHU, feishuRedirectUri } from "@/lib/feishu/config";

export const runtime = "nodejs";

/** 用账号自己配置的应用跳飞书授权页；state 存 httpOnly cookie，回调时校验防 CSRF */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const conn = await prisma.feishuConnection.findUnique({
    where: { userId: session.user.id },
    select: { appId: true, appSecretEnc: true },
  });
  if (!conn?.appId || !conn.appSecretEnc) {
    return NextResponse.json({ error: "请先保存你的飞书应用凭证" }, { status: 400 });
  }

  const origin = publicOrigin(req);
  const state = randomBytes(16).toString("hex");
  const url = new URL(FEISHU.authorizeUrl);
  url.searchParams.set("client_id", conn.appId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", feishuRedirectUri(origin));
  url.searchParams.set("scope", FEISHU.scope);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set("feishu_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https"),
    path: "/api/feishu",
    maxAge: 600,
  });
  return res;
}
