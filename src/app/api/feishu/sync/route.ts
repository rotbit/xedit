import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readOnlyGuard } from "@/lib/guards";
import { FeishuReconnectError } from "@/lib/feishu/oauth";
import { syncFeishuSpace } from "@/lib/feishu/sync";

export const runtime = "nodejs";

/**
 * 同步一批：每次调用处理一小批文档即返回进度，客户端循环调到 done=true。
 * skip 是客户端累计的本轮失败节点，避免坏文档每轮重试卡死进度。
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const userId = session.user.id;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const spaceId = typeof body.spaceId === "string" ? body.spaceId.trim() : "";
  const spaceName = typeof body.spaceName === "string" ? body.spaceName.trim().slice(0, 100) : "";
  const skip: string[] = Array.isArray(body.skip)
    ? body.skip.filter((s: unknown) => typeof s === "string").slice(0, 2000)
    : [];
  if (!spaceId) {
    return NextResponse.json({ error: "缺少知识空间 id" }, { status: 400 });
  }

  try {
    return NextResponse.json(await syncFeishuSpace(userId, spaceId, spaceName, skip));
  } catch (e) {
    if (e instanceof FeishuReconnectError) {
      return NextResponse.json({ error: e.message, needReconnect: true }, { status: 400 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "同步失败" },
      { status: 500 }
    );
  }
}
