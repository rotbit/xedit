/**
 * 飞书开放平台端点常量。
 * 应用凭证是账号维度的：每个用户在设置里填自己创建的自建应用 App ID/Secret，
 * 走「用户身份」OAuth（user_access_token）读自己有权限的知识库。
 */

export const FEISHU = {
  /** 用户授权页 */
  authorizeUrl: "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
  /** 授权码换 token / 刷新 token 共用端点（v3 最新版；v2 已标注为历史版本） */
  tokenUrl: "https://accounts.feishu.cn/oauth/v3/token",
  /** OpenAPI 根 */
  apiBase: "https://open.feishu.cn/open-apis",
  /** 请求的用户身份权限：读知识库结构、读 docx 内容、下载文档图片、发 refresh_token。
   *  图片下载用细粒度的 docs:document.media:download 而非 drive:drive:readonly——
   *  后者是需审核权限（要企业管理员批），前者免审、开通即生效，两者都能调「下载素材」。 */
  scope:
    "wiki:wiki:readonly docx:document:readonly docs:document.media:download offline_access",
  /** 推送/写回需要的额外写入权限（同样免审）：建知识库节点、写 docx 块、上传图片素材 */
  scopeWriteExtra: "wiki:wiki docx:document docs:document.media:upload",
} as const;

/** 判断一串已授予的 scope 是否包含推送所需的全部写入权限 */
export function hasFeishuWriteScopes(granted: string): boolean {
  const set = new Set(granted.split(/\s+/));
  return FEISHU.scopeWriteExtra.split(" ").every((s) => set.has(s));
}

/** OAuth 回调地址：随部署域名走（复用 MCP OAuth 的 publicOrigin 推导）。
 *  用户需把它配进自己飞书应用的「安全设置 → 重定向 URL」。 */
export function feishuRedirectUri(origin: string): string {
  return `${origin}/api/feishu/callback`;
}
