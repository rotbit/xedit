import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { publicOrigin } from "@/lib/oauth/config";
import { FEISHU, feishuRedirectUri } from "@/lib/feishu/config";
import { tk } from "@/i18n/t";

export const runtime = "nodejs";

/** Redirect to Feishu's auth page using the account's own app; state is stored in an httpOnly cookie and checked on callback against CSRF.
 *  ?write=1 also requests write scope (for push/write-back). Read-only by default: auth always fails if the app lacks write scope,
 *  so the upgrade is only prompted explicitly in the push flow, never kept automatically, to avoid trapping users in an auth-failure loop. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  const conn = await prisma.feishuConnection.findUnique({
    where: { userId: session.user.id },
    select: { appId: true, appSecretEnc: true },
  });
  if (!conn?.appId || !conn.appSecretEnc) {
    return NextResponse.json({ error: tk("请先保存你的飞书应用凭证") }, { status: 400 });
  }

  const wantWrite = new URL(req.url).searchParams.get("write") === "1";
  const scope = wantWrite ? `${FEISHU.scope} ${FEISHU.scopeWriteExtra}` : FEISHU.scope;

  const origin = publicOrigin(req);
  const state = randomBytes(16).toString("hex");
  const url = new URL(FEISHU.authorizeUrl);
  url.searchParams.set("client_id", conn.appId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", feishuRedirectUri(origin));
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https"),
    path: "/api/feishu",
    maxAge: 600,
  } as const;
  res.cookies.set("feishu_oauth_state", state, cookieOpts);
  // Record the scopes requested this time as a callback fallback (for when the token response has no scope field)
  res.cookies.set("feishu_oauth_scope", scope, cookieOpts);
  return res;
}
