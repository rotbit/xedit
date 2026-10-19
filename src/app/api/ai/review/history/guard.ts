import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requirePermission } from "@/lib/permissions";
import { tk } from "@/i18n/t";

/** Review history shares the review's gate: must be logged in and have ai_review permission (admins have it built in) */
export async function historyUser(): Promise<{ userId: string } | { response: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      response: NextResponse.json(
        { error: "unauthorized", message: tk("请先登录") },
        { status: 401 }
      ),
    };
  }
  const access = await requirePermission(session, "ai_review");
  if (!access) {
    return {
      response: NextResponse.json(
        { error: "forbidden", message: tk("你的账号还没开通 AI 审核，找管理员开通") },
        { status: 403 }
      ),
    };
  }
  return { userId: access.userId };
}

export const notFound = () =>
  NextResponse.json({ error: "not_found", message: tk("这条审核记录不在了") }, { status: 404 });
