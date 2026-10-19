import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { publicOrigin } from "@/lib/oauth/config";
import { feishuRedirectUri } from "@/lib/feishu/config";
import { exchangeFeishuCode } from "@/lib/feishu/oauth";
import { tk, translate } from "@/i18n/t";
import { htmlLang, type Locale } from "@/i18n/locale";
import { localeOfRequest } from "@/i18n/server";

export const runtime = "nodejs";

/** The callback page opens in the auth popup: on success it tells the main window to refresh and closes itself. message arrives already translated for the locale */
function resultPage(ok: boolean, message: string, locale: Locale): NextResponse {
  const html = `<!doctype html>
<html lang="${htmlLang(locale)}"><head><meta charset="utf-8"><title>${translate("飞书授权", locale)}</title></head>
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
  // Must use the same path as when it was set, or it won't be deleted
  res.cookies.set("feishu_oauth_state", "", { path: "/api/feishu", maxAge: 0 });
  res.cookies.set("feishu_oauth_scope", "", { path: "/api/feishu", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const locale = localeOfRequest(req);
  const page = (ok: boolean, zh: string, vars?: Record<string, string>) =>
    resultPage(ok, translate(zh, locale, vars), locale);
  const session = await auth();
  if (!session?.user?.id) {
    return page(false, tk("登录状态已失效，请回到 xedit 重新登录后再连接飞书。"));
  }

  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    return page(false, tk("授权已取消或被拒绝，可关闭此窗口。"));
  }
  const code = params.get("code");
  const state = params.get("state");
  const expected = req.cookies.get("feishu_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) {
    return page(false, tk("授权校验未通过（state 不匹配或已过期），请回到 xedit 重试。"));
  }

  const err = await exchangeFeishuCode(
    session.user.id,
    code,
    feishuRedirectUri(publicOrigin(req)),
    req.cookies.get("feishu_oauth_scope")?.value ?? ""
  );
  // err comes from lib/feishu; translate it if the dictionary has it
  if (err) return page(false, tk("{err}，请回到 xedit 重试。"), { err: translate(err, locale) });
  return page(true, tk("已连接飞书，此窗口即将自动关闭。"));
}
