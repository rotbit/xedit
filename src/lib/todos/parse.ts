/**
 * Markdown 任务项的解析与改写（纯函数）。
 *
 * 改写一律「只动那一行 / 那几个字节」：待办所在的是用户的正文，
 * 勾一个框不能顺手把 \r\n 换成 \n、把行尾空格抹掉，否则同步那头看到的是整篇改动。
 */

import { parseFrontmatter, setFrontmatterValue } from "@/lib/frontmatter";
import { isDueTag, parseDueTag, todayKey } from "./dates";

export interface ParsedTask {
  /** 0 起的行号（按 \n 切分，含 frontmatter 那几行），改写时按它定位 */
  line: number;
  checked: boolean;
  /** 去掉日期标签后的显示文字 */
  text: string;
  due: string | null;
  /** 时间段 `@开始~结束` 的结束日；单个日期或没日期为 null */
  end: string | null;
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

/** 行尾的关联标记 `[[docId]]`：只认一个，且在日期标签之前（日期标签先剥） */
const LINK_RE = /\s*\[\[([^\[\]\s]+)\]\]$/;

/**
 * 解析一条任务的原文：先剥行尾日期标签，再剥紧挨着的关联标记 `[[docId]]`。
 * 格式是 `文字 [[docId]] @日期`；句中的 `[[x]]` 不算，剥完没字了也不剥（同 parseDueTag 的口径）。
 */
export function parseTaskRaw(
  raw: string,
  today: string
): { text: string; due: string | null; end: string | null; link: string | null } {
  const { text, due, end } = parseDueTag(raw, today);
  const m = LINK_RE.exec(text);
  if (!m) return { text, due, end, link: null };
  const rest = text.slice(0, m.index).trimEnd();
  if (!rest) return { text, due, end, link: null };
  return { text: rest, due, end, link: m[1] };
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

/** 待办的日期：单日 end 为 null，时间段是开始日 due 到结束日 end（两头都算） */
export interface DueRange {
  due: string;
  end: string | null;
}

/**
 * 改第 line 行待办的日期：先剥掉行尾已有的日期标签（口径同 parseDueTag：行尾、前面有空白、
 * 认得的才剥，含 `a~b` 时间段；`@某人` 这种不认识的留在文字里），再追加 ` @YYYY-MM-DD`
 * 或时间段 ` @YYYY-MM-DD~YYYY-MM-DD`；range 为 null 即去掉日期。
 * 缩进、`- [ ]` 前缀与行尾 \r 原样保留，其它行不动；那一行不是任务项就原样返回。
 * today 只用来判断相对标签认不认得（不传取本地今天），测试可固定。
 */
export function setTaskLineDue(
  md: string,
  line: number,
  range: DueRange | null,
  today: string = todayKey()
): string {
  const lines = md.split("\n");
  const target = lines[line];
  if (target === undefined) return md;
  const cr = target.endsWith("\r") ? "\r" : "";
  const m = /^(\s*[-*+]\s+\[(?: |x|X)\]\s+)(.+)$/.exec(cr ? target.slice(0, -1) : target);
  if (!m) return md;
  let text = m[2].trimEnd();
  const tag = /(^|\s)@(\S+)$/.exec(text);
  if (tag && isDueTag(tag[2], today)) {
    const rest = text.slice(0, tag.index).trimEnd();
    // 整行只有一个标签时 parseDueTag 把它当文字，这里也不剥，免得改完成了空任务
    if (rest) text = rest;
  }
  const tagText = range ? (range.end ? `${range.due}~${range.end}` : range.due) : null;
  const next = `${m[1]}${tagText ? `${text} @${tagText}` : text}${cr}`;
  if (next === target) return md;
  lines[line] = next;
  return lines.join("\n");
}

/**
 * 改发布排期：把 frontmatter 里 `publish:`（或 `发布:`）那一行的值换成 due，键名、冒号后的空白、
 * 引号与行尾 \r 都不动；读取时 publish 优先，这里也先找它。没有这个键（或是列表写法）原样返回。
 */
export function setPublishDate(md: string, due: string): string {
  const fm = parseFrontmatter(md);
  if (!fm) return md;
  const lines = md.split("\n");
  let fmLines = 0;
  for (let i = 0; i < fm.end; i++) if (md.charCodeAt(i) === 10) fmLines++;
  for (const key of ["publish", "发布"]) { // i18n-ignore frontmatter key
    for (let i = 1; i < fmLines; i++) {
      const m = /^([^\s:][^:]*?)(\s*:\s*)(["']?)(.*?)\3([ \t]*)(\r?)$/.exec(lines[i]);
      if (!m || m[1].trim() !== key || !m[4].trim()) continue;
      const next = `${m[1]}${m[2]}${m[3]}${due}${m[3]}${m[5]}${m[6]}`;
      if (next === lines[i]) return md;
      lines[i] = next;
      return lines.join("\n");
    }
  }
  return md;
}

/**
 * 改第 line 行待办关联的文章：剥掉旧的 `[[…]]`，link 非空就在文字之后、日期标签之前插 ` [[link]]`；
 * link 为 null 即取消关联。缩进、`- [ ]` 前缀、日期标签与行尾 \r 原样保留；不是任务项就原样返回。
 */
export function setTaskLineLink(md: string, line: number, link: string | null, today: string = todayKey()): string {
  const lines = md.split("\n");
  const target = lines[line];
  if (target === undefined) return md;
  const cr = target.endsWith("\r") ? "\r" : "";
  const m = /^(\s*[-*+]\s+\[(?: |x|X)\]\s+)(.+)$/.exec(cr ? target.slice(0, -1) : target);
  if (!m) return md;
  let text = m[2].trimEnd();
  // 日期标签先拆下来，改完关联再原样接回去（认法同 setTaskLineDue）
  let tail = "";
  const tag = /(^|\s)@(\S+)$/.exec(text);
  if (tag && isDueTag(tag[2], today)) {
    const rest = text.slice(0, tag.index).trimEnd();
    if (rest) {
      tail = text.slice(tag.index + tag[1].length);
      text = rest;
    }
  }
  const old = LINK_RE.exec(text);
  if (old) {
    const rest = text.slice(0, old.index).trimEnd();
    if (rest) text = rest;
  }
  const body = [text, link ? `[[${link}]]` : "", tail].filter(Boolean).join(" ");
  const next = `${m[1]}${body}${cr}`;
  if (next === target) return md;
  lines[line] = next;
  return lines.join("\n");
}
