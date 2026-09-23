import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requirePermission } from "@/lib/permissions";

/** 审核历史与审核本身同一道门：必须登录，且账号开通了 ai_review 权限（管理员自带） */
export async function historyUser(): Promise<{ userId: string } | { response: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      response: NextResponse.json(
        { error: "unauthorized", message: "请先登录" },
        { status: 401 }
      ),
    };
  }
  const access = await requirePermission(session, "ai_review");
  if (!access) {
    return {
      response: NextResponse.json(
        { error: "forbidden", message: "你的账号还没开通 AI 审核，找管理员开通" },
        { status: 403 }
      ),
    };
  }
  return { userId: access.userId };
}

export const notFound = () =>
  NextResponse.json({ error: "not_found", message: "这条审核记录不在了" }, { status: 404 });
