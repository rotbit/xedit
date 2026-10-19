import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readOnlyGuard } from "@/lib/guards";
import { serverError } from "@/lib/routeAuth";
import { FeishuReconnectError } from "@/lib/feishu/oauth";
import { syncFeishuSpace } from "@/lib/feishu/sync";
import { tk } from "@/i18n/t";

export const runtime = "nodejs";

/**
 * Sync one batch: each call processes a small batch of docs and returns progress; the client loops until done=true.
 * skip is the client's accumulated list of nodes that failed this round, so a bad doc can't stall progress by retrying every round.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
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
    return NextResponse.json({ error: tk("缺少知识空间 id") }, { status: 400 });
  }

  try {
    return NextResponse.json(await syncFeishuSpace(userId, spaceId, spaceName, skip));
  } catch (e) {
    if (e instanceof FeishuReconnectError) {
      return NextResponse.json({ error: e.message, needReconnect: true }, { status: 400 });
    }
    // Raw Feishu API responses may contain internal ids and credential fragments; give the user just one line
    return serverError(e, tk("同步失败"));
  }
}
