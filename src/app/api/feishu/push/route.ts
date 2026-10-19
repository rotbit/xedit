import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readOnlyGuard } from "@/lib/guards";
import { serverError } from "@/lib/routeAuth";
import { FeishuReconnectError } from "@/lib/feishu/oauth";
import { pushDocumentToFeishu } from "@/lib/feishu/push";
import { tk } from "@/i18n/t";

export const runtime = "nodejs";

/**
 * Push / write back an xedit article to the Feishu wiki.
 * 409 = Feishu side has newer changes (resend with force to overwrite); 403 = write scope not granted yet.
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
  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  if (!documentId) {
    return NextResponse.json({ error: tk("缺少文章 id") }, { status: 400 });
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
    // Raw Feishu API responses may contain internal ids and credential fragments; give the user just one line
    return serverError(e, tk("推送失败"));
  }
}
