/**
 * The single definition of Markdown → plain text / list excerpt (pure string processing, shared by server and browser).
 *
 * The "strip code blocks → strip images → keep link text → strip markup → collapse whitespace" regexes used to be copied into the document service,
 * the REST list route, the local library, and the search index, each with its own excerpt and pre-truncation lengths,
 * so they drifted apart (some cut at 90 chars, some at 120; some stripped frontmatter, some didn't).
 * Only this copy remains, and the length constants live here too.
 */

import { stripFrontmatter } from "@/lib/frontmatter";

/** Max length of a list excerpt: what fits on one sidebar line */
export const EXCERPT_MAX = 90;

/**
 * Length to truncate to before running the regexes. An excerpt only needs the first few dozen chars, no need to scan a long doc five times;
 * leaves plenty of headroom over EXCERPT_MAX — if the start is all Markdown markup, there's still enough left after stripping.
 */
const SCAN_LIMIT = 2000;

/** Fenced code block: drop entirely, code isn't prose */
const FENCE_RE = /```[\s\S]*?```/g;
/** Image `![alt](url)` */
const IMAGE_RE = /!\[([^\]]*)\]\([^)]*\)/g;
/** Inline link `[text](url)`: keep only the display text */
const LINK_RE = /\[([^\]]*)\]\([^)]*\)/g;
/** Remaining line-start/inline markup, stripped outright */
const MARK_RE = /[#>*`~$|-]/g;

/**
 * Replace image and link syntax with their displayed text (URLs are always dropped).
 * The two flags exist for word counting: it counts image alt as visible text,
 * and needs spaces separating replacements — otherwise `[a](u)[b](u)` would count as one word.
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

/** Plain text with Markdown markup stripped: so 「**重点**」 can be found by searching 「重点」 */
export function plainText(md: string): string {
  return stripLinkSyntax(md.replace(FENCE_RE, " "))
    .replace(MARK_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * List excerpt. Frontmatter is metadata, not content, so strip it first,
 * otherwise the excerpt would start with `tags: ...`.
 */
export function summarize(md: string, opts: { max?: number } = {}): string {
  return plainText(stripFrontmatter(md).slice(0, SCAN_LIMIT)).slice(0, opts.max ?? EXCERPT_MAX);
}
