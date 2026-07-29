import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { publicOrigin } from "@/lib/oauth/config";
import { feishuRedirectUri } from "@/lib/feishu/config";
import { exchangeFeishuCode } from "@/lib/feishu/oauth";

export const runtime = "nodejs";

/** 回调页在授权弹窗里打开：成功则通知主窗口刷新并自关 */
function resultPage(ok: boolean, message: string): NextResponse {
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>飞书授权</title></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;color:#333">
<p style="font-size:14px;text-align:center;line-height:2">${message}</p>
${ok ? `<script>
try { window.opener && window.opener.postMessage({ type: "xedit-feishu-connected" }, window.location.origin); } catch (e) {}
setTimeout(function () { window.close(); }, 1200);
</script>` : ""}
</body></html>`;
  const res = new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  // 与设置时相同的 path 才能删掉
  res.cookies.set("feishu_oauth_state", "", { path: "/api/feishu", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return resultPage(false, "登录状态已失效，请回到 xedit 重新登录后再连接飞书。");
  }

  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    return resultPage(false, "授权已取消或被拒绝，可关闭此窗口。");
  }
  const code = params.get("code");
  const state = params.get("state");
  const expected = req.cookies.get("feishu_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) {
    return resultPage(false, "授权校验未通过（state 不匹配或已过期），请回到 xedit 重试。");
  }

  const err = await exchangeFeishuCode(
    session.user.id,
    code,
    feishuRedirectUri(publicOrigin(req))
  );
  if (err) return resultPage(false, `${err}，请回到 xedit 重试。`);
  return resultPage(true, "已连接飞书，此窗口即将自动关闭。");
}
