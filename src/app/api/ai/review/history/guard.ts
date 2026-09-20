import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminSessionUserId } from "@/lib/admin";

/** 审核历史与审核本身同一道门：必须登录，且只对 ADMIN_EMAILS 白名单开放 */
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
  const userId = adminSessionUserId(session);
  if (!userId) {
    return {
      response: NextResponse.json(
        { error: "forbidden", message: "AI 审核目前只对管理员开放" },
        { status: 403 }
      ),
    };
  }
  return { userId };
}

export const notFound = () =>
  NextResponse.json({ error: "not_found", message: "这条审核记录不在了" }, { status: 404 });
