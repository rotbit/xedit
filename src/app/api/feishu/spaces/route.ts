import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listFeishuSpaces } from "@/lib/feishu/api";
import { serverError } from "@/lib/routeAuth";
import { FeishuReconnectError, getFeishuAccessToken } from "@/lib/feishu/oauth";
import { tk } from "@/i18n/t";

export const runtime = "nodejs";

/** Wiki spaces the current Feishu account can access (candidate sync targets) */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  try {
    const token = await getFeishuAccessToken(session.user.id);
    const spaces = await listFeishuSpaces(token);
    return NextResponse.json({ spaces });
  } catch (e) {
    if (e instanceof FeishuReconnectError) {
      return NextResponse.json({ error: e.message, needReconnect: true }, { status: 400 });
    }
    // Raw Feishu API responses may contain internal ids and credential fragments; give the user just one line
    return serverError(e, tk("加载知识空间失败"));
  }
}
