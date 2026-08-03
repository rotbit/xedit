import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readOnlyGuard } from "@/lib/guards";
import { FeishuReconnectError } from "@/lib/feishu/oauth";
import { pushDocumentToFeishu } from "@/lib/feishu/push";

export const runtime = "nodejs";

/**
 * 把一篇 xedit 文章推送/写回飞书知识库。
 * 409 = 飞书侧有更新（带 force 重发即覆盖）；403 = 还没开通写入权限。
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
  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  if (!documentId) {
    return NextResponse.json({ error: "缺少文章 id" }, { status: 400 });
  }

  try {
    const result = await pushDocumentToFeishu(userId, documentId, body.force === true);
    if ("needWriteAuth" in result) return NextResponse.json(result, { status: 403 });
    if ("conflict" in result) return NextResponse.json(result, { status: 409 });
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof FeishuReconnectError) {
      return NextResponse.json({ error: e.message, needReconnect: true }, { status: 400 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "推送失败" },
      { status: 500 }
    );
  }
}
