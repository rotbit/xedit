/**
 * Site-wide constants: SEO metadata, external links and download URLs in one place,
 * shared as a single source of truth by the landing page, theme pages, robots/sitemap and structured data.
 */

/** Public site URL. Override with NEXT_PUBLIC_SITE_URL for reverse proxy/self-hosting, without a trailing slash. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://xedit.me").replace(
  /\/+$/,
  ""
);

export const SITE_NAME = "xEdit";
export const SITE_TAGLINE = "本地优先的 Markdown 写作工具";

/** Home page description: kept under 150 characters, covering the core search intent */
export const SITE_DESCRIPTION =
  "xEdit 是免费开源的本地优先 Markdown 写作工具：像 Obsidian 一样纯文本、双链、可用本地文件夹当文库，像 Notion 一样有斜杠命令、提示块和拖拽整理；待办自动汇总进今日视图，云端同步、离线可用，内置 MCP 让 AI 直接读写文章。提供网页版与 Mac 客户端。";

/** Keywords for search engines (low weight in modern engines, but still useful for some on-site/third-party search) */
export const SITE_KEYWORDS = [
  "Markdown 编辑器",
  "在线 Markdown 编辑器",
  "所见即所得 Markdown 编辑器",
  "即时渲染 Markdown",
  "Obsidian 替代",
  "Notion 替代",
  "双链笔记",
  "本地优先",
  "本地优先笔记",
  "Markdown 笔记",
  "斜杠命令",
  "待办清单",
  "离线写作",
  "云同步笔记",
  "MCP",
  "MCP Server",
  "AI 写作工具",
  "开源笔记软件",
  "Markdown 转 Word",
  "xEdit",
];

export const GITHUB_URL = "https://github.com/rotbit/xedit";

/** Public contact email: shared by the landing page footer, FAQ and feedback entry; change it only here */
export const CONTACT_EMAIL = "zebinpan08@gmail.com";

/**
 * Mac app entry. The installer hasn't shipped publicly yet, so it points to the repo for now;
 * once a DMG is uploaded to Releases, change it to
 * `${GITHUB_URL}/releases/latest/download/xEdit-arm64.dmg` (with a fixed asset name the site never needs changing again),
 * and switch the Mac CTA labels in the landing dictionaries (features/landing/content) to 「下载 Mac 客户端」 (Download the Mac app).
 */
export const MAC_DOWNLOAD_URL = GITHUB_URL;

export const OG_IMAGE = `${SITE_URL}/og.png`;

/** Build absolute URLs for canonical, sitemap and JSON-LD */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
