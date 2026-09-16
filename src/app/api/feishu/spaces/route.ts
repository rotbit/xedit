import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listFeishuSpaces } from "@/lib/feishu/api";
import { serverError } from "@/lib/routeAuth";
import { FeishuReconnectError, getFeishuAccessToken } from "@/lib/feishu/oauth";

export const runtime = "nodejs";

/** 当前飞书账号可访问的知识空间列表（同步目标的候选） */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  try {
    const token = await getFeishuAccessToken(session.user.id);
    const spaces = await listFeishuSpaces(token);
    return NextResponse.json({ spaces });
  } catch (e) {
    if (e instanceof FeishuReconnectError) {
      return NextResponse.json({ error: e.message, needReconnect: true }, { status: 400 });
    }
    // 飞书接口的原始报文可能带内部 id 与凭证片段，只留一句给用户
    return serverError(e, "加载知识空间失败");
  }
}
