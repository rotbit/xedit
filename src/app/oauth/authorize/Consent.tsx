import { approveAuthorization, denyAuthorization } from "./actions";

interface ConsentParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeMethod: string;
  scope: string;
  resource: string;
  state: string;
}

/** 授权同意页：登录后展示，让用户确认是否把文档访问权授予该 MCP 客户端 */
export default function Consent({
  clientName,
  userEmail,
  params,
}: {
  clientName: string;
  userEmail: string;
  params: ConsentParams;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          授权访问
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
          <span className="font-medium text-neutral-900 dark:text-neutral-100">
            {clientName}
          </span>{" "}
          请求以你的身份
          {userEmail ? <span className="text-neutral-500">（{userEmail}）</span> : null}
          访问 xedit 文档。授权后它可以：
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-neutral-600 dark:text-neutral-400">
          <li>· 查看、搜索你的文档</li>
          <li>· 创建、修改文档</li>
          <li>· 把文档移入回收站（可恢复）</li>
        </ul>

        <form className="mt-7 flex gap-3">
          <input type="hidden" name="client_id" value={params.clientId} />
          <input type="hidden" name="redirect_uri" value={params.redirectUri} />
          <input type="hidden" name="code_challenge" value={params.codeChallenge} />
          <input type="hidden" name="code_method" value={params.codeMethod} />
          <input type="hidden" name="scope" value={params.scope} />
          <input type="hidden" name="resource" value={params.resource} />
          <input type="hidden" name="state" value={params.state} />
          <button
            type="submit"
            formAction={denyAuthorization}
            className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            拒绝
          </button>
          <button
            type="submit"
            formAction={approveAuthorization}
            className="flex-1 rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2.5 text-sm font-medium text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
          >
            允许
          </button>
        </form>

        <p className="mt-5 text-xs leading-5 text-neutral-400">
          仅当你信任该应用时才授权。你可以随时在 xedit 设置里撤销此授权。
        </p>
      </div>
    </main>
  );
}
