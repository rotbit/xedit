/**
 * Markdown → 纯文本 / 列表摘要的唯一口径（纯字符串处理，服务端与浏览器共用）。
 *
 * 「去代码块 → 去图片 → 提链接文字 → 去标记 → 压空白」这套正则原先在文档服务层、
 * REST 列表路由、本地文库、检索索引里各抄一份，摘要长度与预切长度也各写一遍，
 * 结果四处口径互相漂移（有的截 90 字有的截 120，有的剥 frontmatter 有的不剥）。
 * 只留这一份，长度常量也只在这里定。
 */

import { stripFrontmatter } from "@/lib/frontmatter";

/** 列表摘要的字数上限：侧栏一行显示得下的量 */
export const EXCERPT_MAX = 90;

/**
 * 跑正则前先截掉的长度。摘要只要开头几十个字，长文没必要整篇扫五遍；
 * 比 EXCERPT_MAX 留足余量——开头若全是 Markdown 记号，抹完才够凑出摘要。
 */
const SCAN_LIMIT = 2000;

/** 围栏代码块：整块丢掉，里面的代码不是正文 */
const FENCE_RE = /```[\s\S]*?```/g;
/** 图片 `![alt](url)` */
const IMAGE_RE = /!\[([^\]]*)\]\([^)]*\)/g;
/** 行内链接 `[文字](url)`：只留显示文字 */
const LINK_RE = /\[([^\]]*)\]\([^)]*\)/g;
/** 剩下的行首/行内记号，直接抹掉 */
const MARK_RE = /[#>*`~$|-]/g;

/**
 * 把图片与链接语法换成它们显示出来的文字（URL 一律不要）。
 * 两个开关是为字数统计留的：字数口径把图片 alt 当可见文字计入，
 * 还要用空格把替换处隔开——`[a](u)[b](u)` 不隔开会被当成一个词。
 */
export function stripLinkSyntax(
  md: string,
  opts: { keepAlt?: boolean; pad?: boolean } = {}
): string {
  const pad = opts.pad ? " " : "";
  return md
    .replace(IMAGE_RE, opts.keepAlt ? `${pad}$1${pad}` : " ")
    .replace(LINK_RE, `${pad}$1${pad}`);
}

/** 抹掉 Markdown 记号的纯文本：让「**重点**」能被「重点」搜到 */
export function plainText(md: string): string {
  return stripLinkSyntax(md.replace(FENCE_RE, " "))
    .replace(MARK_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 列表摘要。frontmatter 是元数据不是正文，先剥掉，
 * 免得摘要开头全是 `tags: ...`。
 */
export function summarize(md: string, opts: { max?: number } = {}): string {
  return plainText(stripFrontmatter(md).slice(0, SCAN_LIMIT)).slice(0, opts.max ?? EXCERPT_MAX);
}
