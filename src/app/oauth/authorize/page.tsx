import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getClient, parseRedirectUris } from "@/lib/oauth/store";
import { DEFAULT_SCOPE } from "@/lib/oauth/config";
import { tk, translate } from "@/i18n/t";
import { requestLocale } from "@/i18n/server";
import type { Locale } from "@/i18n/locale";
import Consent from "./Consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

/** 复原当前 authorize 完整 URL，登录后原样跳回继续授权 */
function selfUrl(sp: SP): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = first(v);
    if (val) q.set(k, val);
  }
  return `/oauth/authorize?${q.toString()}`;
}

function ErrorView({ title, detail, locale }: { title: string; detail: string; locale: Locale }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-red-600">{translate(title, locale)}</h1>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">{translate(detail, locale)}</p>
      </div>
    </main>
  );
}

// OAuth 2.1 授权端点（浏览器访问）。校验 client/回调后，复用 next-auth 登录态弹同意页。
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const clientId = first(sp.client_id);
  const redirectUri = first(sp.redirect_uri);
  const responseType = first(sp.response_type);
  const codeChallenge = first(sp.code_challenge);
  const codeMethod = first(sp.code_challenge_method) || "plain";
  const state = first(sp.state);
  const scope = first(sp.scope) || DEFAULT_SCOPE;
  const resource = first(sp.resource);
  const locale = await requestLocale();

  // 客户端与回调地址：回调不合法时绝不回跳（防开放重定向），直接报错页
  const client = clientId ? await getClient(clientId) : null;
  if (!client) {
    return <ErrorView title={tk("无效的客户端")} detail={tk("client_id 未注册或不存在。")} locale={locale} />;
  }
  if (!redirectUri || !parseRedirectUris(client).includes(redirectUri)) {
    return <ErrorView title={tk("回调地址不被允许")} detail={tk("redirect_uri 与注册值不匹配。")} locale={locale} />;
  }

  // 回调地址合法后，其余参数错误可按 OAuth 规范安全回跳报错
  const backError = (err: string, desc: string): never => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", err);
    u.searchParams.set("error_description", desc);
    if (state) u.searchParams.set("state", state);
    redirect(u.toString());
  };
  // error_description 是回给 OAuth 客户端的协议字段，不是界面文案
  if (responseType !== "code") backError("unsupported_response_type", "仅支持 response_type=code"); // i18n-ignore
  if (!codeChallenge) backError("invalid_request", "缺少 code_challenge"); // i18n-ignore
  if (codeMethod !== "S256") backError("invalid_request", "code_challenge_method 必须为 S256"); // i18n-ignore

  // 未登录先跳 next-auth 登录页，登录后原样回到本授权页
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(selfUrl(sp))}`);
  }

  return (
    <Consent
      clientName={client.name || translate("未命名应用", locale)}
      locale={locale}
      userEmail={session.user.email ?? ""}
      params={{ clientId, redirectUri, codeChallenge, codeMethod, scope, resource, state }}
    />
  );
}
