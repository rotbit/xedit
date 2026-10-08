/**
 * Markdown 任务项的解析与改写（纯函数）。
 *
 * 改写一律「只动那一行 / 那几个字节」：待办所在的是用户的正文，
 * 勾一个框不能顺手把 \r\n 换成 \n、把行尾空格抹掉，否则同步那头看到的是整篇改动。
 */

import { parseFrontmatter, setFrontmatterValue } from "@/lib/frontmatter";
import { parseDueTag } from "./dates";

export interface ParsedTask {
  /** 0 起的行号（按 \n 切分，含 frontmatter 那几行），改写时按它定位 */
  line: number;
  checked: boolean;
  /** 去掉日期标签后的显示文字 */
  text: string;
  due: string | null;
}

/** 未解析日期标签的原始任务行：缓存存这一份，日期标签留到取用时按「今天」现算 */
export interface RawTask {
  line: number;
  checked: boolean;
  raw: string;
}

const TASK_RE = /^\s*[-*+]\s+\[( |x|X)\]\s+(.+)$/;
/** 围栏代码块：最多缩进 3 格，``` 或 ~~~ 至少三个 */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** frontmatter 占了前几行：解析器给的是字符偏移，换算成行数 */
function bodyStartLine(md: string): number {
  const fm = parseFrontmatter(md);
  if (!fm) return 0;
  let n = 0;
  for (let i = 0; i < fm.end; i++) if (md.charCodeAt(i) === 10) n++;
  return n;
}

/** 扫出所有任务行（跳过 frontmatter 与围栏代码块，空文字的忽略） */
export function parseTaskLines(md: string): RawTask[] {
  const lines = md.split("\n");
  const out: RawTask[] = [];
  let fence: string | null = null; // 当前所在代码块的开栏记号
  for (let i = bodyStartLine(md); i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    const f = FENCE_RE.exec(line);
    if (fence) {
      // 收栏：同一种字符、不短于开栏，后面只能是空白
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.slice(line.indexOf(f[1]) + f[1].length).trim()) {
        fence = null;
      }
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    const m = TASK_RE.exec(line);
    if (!m) continue;
    const raw = m[2].trim();
    if (!raw) continue;
    out.push({ line: i, checked: m[1] !== " ", raw });
  }
  return out;
}

export function parseTasks(md: string, today: string): ParsedTask[] {
  return parseTaskLines(md).map(({ line, checked, raw }) => ({ line, checked, ...parseDueTag(raw, today) }));
}

/** frontmatter 里的一个标量值（列表写法不算） */
function scalar(data: Record<string, string | string[]>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** `publish: 2026-10-12`（也认 `发布:`，允许 2026/10/12 与不补零），统一成补零的日期键 */
export function parsePublish(md: string): { due: string | null; published: boolean } {
  const fm = parseFrontmatter(md);
  if (!fm) return { due: null, published: false };
  const raw = scalar(fm.data, "publish", "发布"); // i18n-ignore frontmatter key
  const m = raw ? /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw) : null;
  const due = m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
  const flag = scalar(fm.data, "published")?.toLowerCase();
  return { due, published: flag === "true" || flag === "yes" || flag === "是" }; // i18n-ignore frontmatter 值
}

/** 「待办清单」那篇：frontmatter `type: todo` */
export function isNotesDoc(md: string): boolean {
  const fm = parseFrontmatter(md);
  return scalar(fm?.data ?? {}, "type")?.toLowerCase() === "todo";
}

/** 只改第 line 行的勾选框；那一行不是任务项就原样返回 */
export function toggleTaskLine(md: string, line: number, checked: boolean): string {
  const lines = md.split("\n");
  const target = lines[line];
  if (target === undefined) return md;
  const next = target.replace(/^(\s*[-*+]\s+\[)( |x|X)(\])/, `$1${checked ? "x" : " "}$3`);
  if (next === target) return md;
  lines[line] = next;
  return lines.join("\n");
}

/**
 * 删掉第 line 行（连同它的换行）；那一行不是任务项就原样返回。
 * 按 \n 切开再拼回去：\r 留在各行自己的尾巴上，删掉一整段 `内容\r` 之后 \r\n 风格自然不变。
 */
export function removeTaskLine(md: string, line: number): string {
  const lines = md.split("\n");
  const target = lines[line];
  if (target === undefined || !TASK_RE.test(target.replace(/\r$/, ""))) return md;
  lines.splice(line, 1);
  return lines.join("\n");
}

/** 末尾追加一行 `- [ ] text`；沿用原文的换行风格，文末有没有换行都接得上 */
export function appendTask(md: string, text: string): string {
  const clean = text.replace(/[\r\n]+/g, " ").trim();
  if (!clean) return md;
  const item = `- [ ] ${clean}`;
  const eol = md.includes("\r\n") ? "\r\n" : "\n";
  if (!md) return item + eol;
  return md.endsWith("\n") ? md + item + eol : md + eol + item + eol;
}

/**
 * 勾掉「发布《标题》」= 在 frontmatter 收尾 `---` 前插一行 `published: true`。
 * 没有 frontmatter 就不动：publish 待办本来就只从 frontmatter 生成，不会走到这里。
 */
export function markPublished(md: string): string {
  const fm = parseFrontmatter(md);
  if (!fm) return md;
  // 已有 published 键（如写着 false）就整行替换，免得出现两个同名键
  if ("published" in fm.data) return setFrontmatterValue(md, "published", "true");
  const head = md.slice(0, fm.end);
  // 收尾 `---` 所在行的起点：frontmatter 段去掉末尾换行后的最后一行
  const trimmed = head.replace(/\r?\n$/, "");
  const closeAt = trimmed.lastIndexOf("\n") + 1;
  const eol = head.includes("\r\n") ? "\r\n" : "\n";
  return md.slice(0, closeAt) + "published: true" + eol + md.slice(closeAt);
}
