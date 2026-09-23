import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sessionPermissions } from "@/lib/permissions";

/**
 * 当前账号实际能用哪些功能（管理员全开、封禁全关的口径已在 lib/permissions 算好）。
 * 前端据此决定亮不亮入口；真正的门禁在各接口自己，这里只是给界面看的。
 * 没登录不算错，回空列表；每次现查库，不许缓存——后台刚撤销的权限要马上反映出来。
 */
export async function GET() {
  const permissions = await sessionPermissions(await auth());
  return NextResponse.json({ permissions }, { headers: { "Cache-Control": "no-store" } });
}
