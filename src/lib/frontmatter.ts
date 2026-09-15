/**
 * YAML frontmatter 与 `#标签` 的纯解析层：编辑器、预览、检索共用同一套口径。
 *
 * 只认极简 YAML（`key: 值` / `key: [a, b]` / `key:` + `- x` 列表）而不引一个 YAML 库：
 * 公众号写作用到的 frontmatter 就是标题、标签、日期这几行，
 * 引一个解析器要多打包几十 KB，还会把锚点、别名这些谁也不写的语法一起带进来。
 *
 * 内联标签按 Obsidian 口径：`#` 前是行首或空白、后面紧跟合法标签字符，
 * 于是 `# 标题`（# 后是空格）、`a#b`（# 前不是空白）都不会被误判成标签。
 */

import { codeRanges } from "@/lib/wikiLink";

export interface Frontmatter {
  /** 解析出的键值；数组写法与列表写法都归一成 string[] */
  data: Record<string, string | string[]>;
  /** frontmatter 之后的正文 */
  body: string;
  /** frontmatter 结束处的偏移（含收尾 `---` 行及其换行） */
  end: number;
}

/** 起止分隔行：只认单独成行的 `---`（尾随空格无所谓） */
const FENCE = /^---[ \t]*$/;

/** 标签正文允许的字符：字母/数字/中文/`_`/`-`/`/`（层级用 `/`） */
const TAG_BODY = /[\p{L}\p{N}_\-/]/u;

/** 一个字符能否出现在标签里 —— 供编辑器（lezer）与预览（markdown-it）复用同一口径 */
export function isTagChar(ch: string): boolean {
  return ch.length === 1 && TAG_BODY.test(ch);
}

/** `#` 之前是否是合法边界：行首（传空串）或空白 */
export function isTagBoundary(prev: string): boolean {
  return prev === "" || /\s/.test(prev);
}

/**
 * 标签的比较口径：去掉前导 `#`、去掉层级末尾的 `/`、小写。
 * 纯数字（`#1`、`#2024`）不算标签 —— 那是编号或年份，不是分类。
 * 不合法时返回 null。
 */
export function normalizeTag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, "").replace(/\/+$/, "").toLowerCase();
  if (!tag || /^[0-9]+$/.test(tag)) return null;
  return /^[\p{L}\p{N}_\-/]+$/u.test(tag) ? tag : null;
}

/** 去掉值两侧成对的引号 */
function unquote(value: string): string {
  const m = /^(["'])([\s\S]*)\1$/.exec(value);
  return m ? m[2] : value;
}

/** 极简 YAML：只处理顶层 `key: 值` / `key: [a, b]` / `key:` + `- x`，其余整行忽略 */
function parseEntries(lines: string[]): Record<string, string | string[]> {
  const data: Record<string, string | string[]> = {};
  let listKey: string | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue; // 空行与注释

    // `- x`：归到上一个空值键下；`key:` 后没跟列表就保持空串
    if (listKey && /^-(\s|$)/.test(trimmed)) {
      const value = unquote(trimmed.slice(1).trim());
      if (value) {
        const bucket = data[listKey];
        if (Array.isArray(bucket)) bucket.push(value);
        else data[listKey] = [value];
      }
      continue;
    }

    if (/^\s/.test(line)) continue; // 缩进的非列表行＝嵌套结构，不支持
    const at = line.indexOf(":");
    const key = at > 0 ? line.slice(0, at).trim() : "";
    if (!key) continue;

    const value = line.slice(at + 1).trim();
    if (!value) {
      data[key] = "";
      listKey = key; // 等着后面的 `- x`
      continue;
    }
    listKey = null;
    const inline = /^\[([\s\S]*)\]$/.exec(value);
    data[key] = inline
      ? inline[1]
          .split(",")
          .map((item) => unquote(item.trim()))
          .filter(Boolean)
      : unquote(value);
  }
  return data;
}

/** 解析文档最开头的 frontmatter；不是以 `---` 开头、或没有收尾 `---` 都返回 null */
export function parseFrontmatter(md: string): Frontmatter | null {
  if (!md.startsWith("---")) return null;
  const lines = md.split("\n");
  if (!FENCE.test(lines[0].replace(/\r$/, ""))) return null;

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FENCE.test(lines[i].replace(/\r$/, ""))) {
      close = i;
      break;
    }
  }
  if (close === -1) return null;

  let end = 0;
  for (let i = 0; i <= close; i++) end += lines[i].length + 1; // +1 是被 split 吃掉的换行
  end = Math.min(end, md.length); // 收尾 `---` 就是文末时没有那个换行
  return { data: parseEntries(lines.slice(1, close)), body: md.slice(end), end };
}

/** 去掉 frontmatter，只留正文；没有 frontmatter 时原样返回 */
export function stripFrontmatter(md: string): string {
  return parseFrontmatter(md)?.body ?? md;
}

/**
 * 全文标签：frontmatter 的 `tags` + 正文里的内联 `#标签`。
 * 小写去重，保持首次出现的顺序（frontmatter 的排在前面）。
 * 围栏代码与行内代码里的 `#` 是注释或井号，不算标签。
 */
export function extractTags(md: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || seen.has(tag)) return;
    seen.add(tag);
    out.push(tag);
  };

  const fm = parseFrontmatter(md);
  if (fm) {
    const value = fm.data.tags;
    // 字符串写法 `tags: 前端, react` 按逗号/空白拆开（中文逗号一并认）
    if (Array.isArray(value)) value.forEach(add);
    else if (typeof value === "string") value.split(/[,，、\s]+/).forEach(add);
  }

  const body = fm ? fm.body : md;
  const skip = codeRanges(body);
  const re = /#[\p{L}\p{N}_\-/]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const at = m.index;
    if (!isTagBoundary(at > 0 ? body[at - 1] : "")) continue;
    if (skip.some(([s, e]) => at >= s && at < e)) continue;
    add(m[0]);
  }
  return out;
}
