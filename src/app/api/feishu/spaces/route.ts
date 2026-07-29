import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listFeishuSpaces } from "@/lib/feishu/api";
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
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "加载知识空间失败" },
      { status: 500 }
    );
  }
}
