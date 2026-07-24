import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getClient, parseRedirectUris } from "@/lib/oauth/store";
import { DEFAULT_SCOPE } from "@/lib/oauth/config";
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

function ErrorView({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-red-600">{title}</h1>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">{detail}</p>
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

  // 客户端与回调地址：回调不合法时绝不回跳（防开放重定向），直接报错页
  const client = clientId ? await getClient(clientId) : null;
  if (!client) {
    return <ErrorView title="无效的客户端" detail="client_id 未注册或不存在。" />;
  }
  if (!redirectUri || !parseRedirectUris(client).includes(redirectUri)) {
    return <ErrorView title="回调地址不被允许" detail="redirect_uri 与注册值不匹配。" />;
  }

  // 回调地址合法后，其余参数错误可按 OAuth 规范安全回跳报错
  const backError = (err: string, desc: string): never => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", err);
    u.searchParams.set("error_description", desc);
    if (state) u.searchParams.set("state", state);
    redirect(u.toString());
  };
  if (responseType !== "code") backError("unsupported_response_type", "仅支持 response_type=code");
  if (!codeChallenge) backError("invalid_request", "缺少 code_challenge");
  if (codeMethod !== "S256") backError("invalid_request", "code_challenge_method 必须为 S256");

  // 未登录先跳 next-auth 登录页，登录后原样回到本授权页
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(selfUrl(sp))}`);
  }

  return (
    <Consent
      clientName={client.name || "未命名应用"}
      userEmail={session.user.email ?? ""}
      params={{ clientId, redirectUri, codeChallenge, codeMethod, scope, resource, state }}
    />
  );
}
