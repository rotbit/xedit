/**
 * 站点级常量：SEO 元信息、外链与下载地址集中一处，
 * 落地页、主题页、robots/sitemap 与结构化数据共用同一份事实。
 */

/** 公网站点地址。反代/自托管时用 NEXT_PUBLIC_SITE_URL 覆盖，不带结尾斜杠。 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://xedit.me").replace(
  /\/+$/,
  ""
);

export const SITE_NAME = "xEdit";
export const SITE_TAGLINE = "Markdown 公众号排版工具";

/** 首页 description：控制在 150 字以内，覆盖核心检索意图 */
export const SITE_DESCRIPTION =
  "xEdit 是一款免费的 Markdown 微信公众号排版工具：左边写 Markdown，右边实时预览，一键复制到公众号或知乎，样式全部内联不丢失。内置 13 套排版主题、数学公式、图床上传、版本回滚、AI 内容审查与云端同步，支持网页版与 Mac 客户端。";

/** 面向搜索引擎的关键词（现代搜索引擎权重低，但对部分站内/第三方检索仍有用） */
export const SITE_KEYWORDS = [
  "公众号排版",
  "微信公众号排版工具",
  "Markdown 公众号",
  "Markdown 转公众号",
  "公众号编辑器",
  "微信公众号编辑器",
  "Markdown 编辑器",
  "知乎排版",
  "公众号排版主题",
  "公众号 Markdown 工具",
  "在线 Markdown 编辑器",
  "xEdit",
];

export const GITHUB_URL = "https://github.com/rotbit/xedit";

/**
 * Mac 客户端入口。安装包尚未对外发版，先指向仓库；
 * 等 Releases 上传好 DMG 后改成
 * `${GITHUB_URL}/releases/latest/download/xEdit-arm64.dmg`（资产名固定即可长期不用再改站点），
 * 同时把 MAC_CTA 换成「下载 Mac 客户端」。
 */
export const MAC_DOWNLOAD_URL = GITHUB_URL;
export const MAC_CTA = "获取 Mac 客户端";
/** 客户端要求，展示在按钮旁 */
export const MAC_REQUIREMENT = "macOS 12+ · Apple Silicon";

export const OG_IMAGE = `${SITE_URL}/og.png`;

/** 拼绝对地址，供 canonical、sitemap 与 JSON-LD 使用 */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
