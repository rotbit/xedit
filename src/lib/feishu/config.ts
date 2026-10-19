/**
 * Feishu open platform endpoint constants.
 * App credentials are per account: each user enters the App ID/Secret of their own custom app in settings,
 * and uses "user identity" OAuth (user_access_token) to read the wikis they have access to.
 */

export const FEISHU = {
  /** User authorization page */
  authorizeUrl: "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
  /** Shared endpoint for exchanging the auth code and refreshing tokens (latest v3; v2 is marked legacy) */
  tokenUrl: "https://accounts.feishu.cn/oauth/v3/token",
  /** OpenAPI root */
  apiBase: "https://open.feishu.cn/open-apis",
  /** User-identity scopes requested: read wiki structure, read docx content, download document images, issue refresh_token.
   *  Image download uses the fine-grained docs:document.media:download rather than drive:drive:readonly —
   *  the latter requires review (an enterprise admin must approve), the former needs none and works once enabled; both can call "download media". */
  scope:
    "wiki:wiki:readonly docx:document:readonly docs:document.media:download offline_access",
  /** Extra write scopes needed for push/write-back (also no review): create wiki nodes, write docx blocks, upload image assets */
  scopeWriteExtra: "wiki:wiki docx:document docs:document.media:upload",
} as const;

/** Whether a set of granted scopes includes all write scopes needed for push */
export function hasFeishuWriteScopes(granted: string): boolean {
  const set = new Set(granted.split(/\s+/));
  return FEISHU.scopeWriteExtra.split(" ").every((s) => set.has(s));
}

/** OAuth callback URL: follows the deployment domain (reuses the MCP OAuth publicOrigin derivation).
 *  Users must add it to their Feishu app under 「安全设置 → 重定向 URL」 (Security settings → Redirect URLs). */
export function feishuRedirectUri(origin: string): string {
  return `${origin}/api/feishu/callback`;
}
