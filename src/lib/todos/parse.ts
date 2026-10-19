/**
 * Parsing and rewriting of Markdown task items (pure functions).
 *
 * Rewrites always touch "only that line / those few bytes": todos live in the user's own text,
 * and checking a box must not also turn \r\n into \n or strip trailing spaces, or sync sees the whole doc as changed.
 */

import { parseFrontmatter, setFrontmatterValue } from "@/lib/frontmatter";
import { isDueTag, parseRepeatTag, parseTaskTag, todayKey } from "./dates";

export interface ParsedTask {
  /** 0-based line number (split on \n, frontmatter lines included), used to locate the line when rewriting */
  line: number;
  checked: boolean;
  /** Display text with the date tag removed */
  text: string;
  due: string | null;
  /** End date of a `@start~end` range; null for a single date or no date */
  end: string | null;
  /** Line ends with `@每天` / `@daily`: due is always today, and checked depends only on the completion date in the tag */
  repeat: "daily" | null;
}

/** Raw task line with date tags unresolved: this is what the cache stores; date tags are resolved against "today" on read */
export interface RawTask {
  line: number;
  checked: boolean;
  raw: string;
}

const TASK_RE = /^\s*[-*+]\s+\[( |x|X)\]\s+(.+)$/;
/** Line start through the checkbox: $2 is the character inside the box */
const BOX_RE = /^(\s*[-*+]\s+\[)( |x|X)(\])/;

/** Rewrite the checkbox in the prefix (indent + `- [ ] `) to match checked */
const withBox = (prefix: string, checked: boolean) => prefix.replace(BOX_RE, `$1${checked ? "x" : " "}$3`);
/** Fenced code block: indented at most 3 spaces, at least three ``` or ~~~ */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** Lines taken by frontmatter: the parser gives a character offset, convert it to a line count */
function bodyStartLine(md: string): number {
  const fm = parseFrontmatter(md);
  if (!fm) return 0;
  let n = 0;
  for (let i = 0; i < fm.end; i++) if (md.charCodeAt(i) === 10) n++;
  return n;
}

/** Scan all task lines (skipping frontmatter and fenced code blocks, ignoring empty text) */
export function parseTaskLines(md: string): RawTask[] {
  const lines = md.split("\n");
  const out: RawTask[] = [];
  let fence: string | null = null; // Opening fence marker of the code block we're in
  for (let i = bodyStartLine(md); i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    const f = FENCE_RE.exec(line);
    if (fence) {
      // Closing fence: same character, no shorter than the opener, followed only by whitespace
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

/** Trailing link marker `[[docId]]`: only one, and before the date tag (date tags are stripped first) */
const LINK_RE = /\s*\[\[([^\[\]\s]+)\]\]$/;

export interface ResolvedTask {
  text: string;
  due: string | null;
  end: string | null;
  link: string | null;
  repeat: "daily" | null;
  checked: boolean;
}

/**
 * Raw task text + checkbox → everything the UI needs. Strip the trailing date / repeat tag first; with withLink, also strip the adjacent
 * link marker `[[docId]]` (only the todo checklist recognizes it: `[[…]]` in an article body is the user's own text).
 * Format is `text [[docId]] @tag`; a mid-sentence `[[x]]` doesn't count, and nothing is stripped if it would leave no text (same rule as parseDueTag).
 * Daily tasks ignore the checkbox: an `[x]` left from checking it yesterday doesn't count today; only whether the tag's completion date is today matters.
 */
export function resolveTask(raw: string, checked: boolean, today: string, withLink: boolean): ResolvedTask {
  const tag = parseTaskTag(raw, today);
  let text = tag.text;
  let link: string | null = null;
  const m = withLink ? LINK_RE.exec(text) : null;
  const rest = m ? text.slice(0, m.index).trimEnd() : "";
  if (m && rest) {
    text = rest;
    link = m[1];
  }
  const done = tag.repeat ? tag.last === today : checked;
  return { text, due: tag.due, end: tag.end, link, repeat: tag.repeat, checked: done };
}

/** Text, date and link of a todo checklist line (checkbox ignored); see resolveTask for the rules */
export function parseTaskRaw(
  raw: string,
  today: string
): { text: string; due: string | null; end: string | null; link: string | null } {
  const { text, due, end, link } = resolveTask(raw, false, today, true);
  return { text, due, end, link };
}

export function parseTasks(md: string, today: string): ParsedTask[] {
  return parseTaskLines(md).map(({ line, checked, raw }) => {
    const r = resolveTask(raw, checked, today, false);
    return { line, checked: r.checked, text: r.text, due: r.due, end: r.end, repeat: r.repeat };
  });
}

/** A scalar value in frontmatter (list syntax doesn't count) */
function scalar(data: Record<string, string | string[]>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** `publish: 2026-10-12` (also accepts `发布:`, 2026/10/12 and unpadded forms), normalized to a zero-padded date key */
export function parsePublish(md: string): { due: string | null; published: boolean } {
  const fm = parseFrontmatter(md);
  if (!fm) return { due: null, published: false };
  const raw = scalar(fm.data, "publish", "发布"); // i18n-ignore frontmatter key
  const m = raw ? /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw) : null;
  const due = m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
  const flag = scalar(fm.data, "published")?.toLowerCase();
  return { due, published: flag === "true" || flag === "yes" || flag === "是" }; // i18n-ignore frontmatter value
}

/** The 「待办清单」 (Todo checklist) doc: frontmatter `type: todo` */
export function isNotesDoc(md: string): boolean {
  const fm = parseFrontmatter(md);
  return scalar(fm?.data ?? {}, "type")?.toLowerCase() === "todo";
}

/**
 * Toggle only the checkbox on line `line`; if that line isn't a task item, return unchanged.
 * Daily tasks (ending in `@每天` / `@daily`) also write the completion date into the tag: checking records `@每天:today`, unchecking drops the date —
 * `[x]` alone can't tell whether it was checked today or some other day, and it has to revert to not done the next day. today defaults to local today; tests can pin it.
 */
export function toggleTaskLine(md: string, line: number, checked: boolean, today: string = todayKey()): string {
  const lines = md.split("\n");
  const target = lines[line];
  if (target === undefined) return md;
  if (!BOX_RE.test(target)) return md;
  const next = target
    .replace(BOX_RE, `$1${checked ? "x" : " "}$3`)
    // Reattach trailing whitespace (including \r) as-is; only the tag characters change
    .replace(/(\s@)(\S+)(\s*)$/, (all, at: string, tag: string, tail: string) => {
      const rep = parseRepeatTag(tag);
      return rep ? `${at}${checked ? `${rep.word}:${today}` : rep.word}${tail}` : all;
    });
  if (next === target) return md;
  lines[line] = next;
  return lines.join("\n");
}

/**
 * Delete line `line` (with its newline); if that line isn't a task item, return unchanged.
 * Split on \n and rejoin: \r stays at the end of each line, so removing a whole `content\r` segment keeps \r\n style intact.
 */
export function removeTaskLine(md: string, line: number): string {
  const lines = md.split("\n");
  const target = lines[line];
  if (target === undefined || !TASK_RE.test(target.replace(/\r$/, ""))) return md;
  lines.splice(line, 1);
  return lines.join("\n");
}

/** Append a `- [ ] text` line; reuses the original newline style and works whether or not the text ends with a newline */
export function appendTask(md: string, text: string): string {
  const clean = text.replace(/[\r\n]+/g, " ").trim();
  if (!clean) return md;
  const item = `- [ ] ${clean}`;
  const eol = md.includes("\r\n") ? "\r\n" : "\n";
  if (!md) return item + eol;
  return md.endsWith("\n") ? md + item + eol : md + eol + item + eol;
}

/**
 * Checking off 「发布《标题》」 (Publish "Title") = insert a `published: true` line before the closing `---` of the frontmatter.
 * Without frontmatter, do nothing: publish todos are only generated from frontmatter, so we never get here.
 */
export function markPublished(md: string): string {
  const fm = parseFrontmatter(md);
  if (!fm) return md;
  // If a published key already exists (e.g. set to false), replace the whole line to avoid duplicate keys
  if ("published" in fm.data) return setFrontmatterValue(md, "published", "true");
  const head = md.slice(0, fm.end);
  // Start of the closing `---` line: the last line of the frontmatter block with its trailing newline removed
  const trimmed = head.replace(/\r?\n$/, "");
  const closeAt = trimmed.lastIndexOf("\n") + 1;
  const eol = head.includes("\r\n") ? "\r\n" : "\n";
  return md.slice(0, closeAt) + "published: true" + eol + md.slice(closeAt);
}

/** A todo's date: end is null for a single day; a range runs from start due to end (inclusive) */
export interface DueRange {
  due: string;
  end: string | null;
}

/**
 * Change the date of the todo on line `line`: first strip the existing trailing date tag (same rules as parseDueTag: at end of line, preceded by whitespace,
 * recognized ones only, including `a~b` ranges; unrecognized ones like `@someone` stay in the text), then append ` @YYYY-MM-DD`
 * or the range ` @YYYY-MM-DD~YYYY-MM-DD`; a null range removes the date.
 * Indent, `- [ ]` prefix and trailing \r are preserved and other lines untouched; if that line isn't a task item, return unchanged.
 * today is only used to decide whether relative tags are recognized (defaults to local today); tests can pin it.
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
  let prefix = m[1];
  const tag = /(^|\s)@(\S+)$/.exec(text);
  if (tag && isDueTag(tag[2], today)) {
    const rest = text.slice(0, tag.index).trimEnd();
    // If the line is only a tag, parseDueTag treats it as text; don't strip here either, or we'd end up with an empty task
    if (rest) {
      text = rest;
      // Daily task changed to a fixed date: the `[x]` left from yesterday mustn't carry over, or moving it would mark it 「已完成」 (Done)
      const rep = parseRepeatTag(tag[2]);
      if (rep) prefix = withBox(prefix, rep.last === today);
    }
  }
  const tagText = range ? (range.end ? `${range.due}~${range.end}` : range.due) : null;
  const next = `${prefix}${tagText ? `${text} @${tagText}` : text}${cr}`;
  if (next === target) return md;
  lines[line] = next;
  return lines.join("\n");
}

/**
 * Change the publish schedule: replace the value on the `publish:` (or `发布:`) line in frontmatter with due, leaving the key, the whitespace after the colon,
 * quotes and trailing \r untouched; reading prefers publish, so we look for it first too. Without the key (or with list syntax), return unchanged.
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
 * Change the linked article of the todo on line `line`: strip the old `[[…]]`; if link is non-empty, insert ` [[link]]` after the text and before the date tag;
 * a null link removes the link. Indent, `- [ ]` prefix, date tag and trailing \r are preserved; if it isn't a task item, return unchanged.
 */
export function setTaskLineLink(md: string, line: number, link: string | null, today: string = todayKey()): string {
  const lines = md.split("\n");
  const target = lines[line];
  if (target === undefined) return md;
  const cr = target.endsWith("\r") ? "\r" : "";
  const m = /^(\s*[-*+]\s+\[(?: |x|X)\]\s+)(.+)$/.exec(cr ? target.slice(0, -1) : target);
  if (!m) return md;
  let text = m[2].trimEnd();
  // Detach the date tag first and reattach it unchanged after updating the link (recognized the same way as setTaskLineDue)
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

/**
 * Set / clear daily repeat. Set: strip any existing trailing date or repeat tag and append ` @每天` (link marker still goes before it).
 * Clear: replace the repeat tag with today's date `@today` — non-checklist todos without a date don't show on the Today page, so removing it would make it vanish silently;
 * the checkbox is rewritten based on "done today or not", so yesterday's `[x]` doesn't make it Done the moment repeat is cleared.
 * Indent, prefix and trailing \r are preserved; if it isn't a task item, or already is / isn't repeating, return unchanged.
 */
export function setTaskLineRepeat(md: string, line: number, on: boolean, today: string = todayKey()): string {
  const lines = md.split("\n");
  const target = lines[line];
  if (target === undefined) return md;
  const cr = target.endsWith("\r") ? "\r" : "";
  const m = /^(\s*[-*+]\s+\[(?: |x|X)\]\s+)(.+)$/.exec(cr ? target.slice(0, -1) : target);
  if (!m) return md;
  let prefix = m[1];
  let text = m[2].trimEnd();
  const tag = /(^|\s)@(\S+)$/.exec(text);
  const rep = tag ? parseRepeatTag(tag[2]) : null;
  const rest = tag ? text.slice(0, tag.index).trimEnd() : "";
  if (on) {
    if (rep) return md;
    // Same as setTaskLineDue: don't strip when the line is only a tag
    if (tag && rest && isDueTag(tag[2], today)) text = rest;
    text = `${text} @每天`; // i18n-ignore tag data
  } else {
    if (!rep) return md;
    prefix = withBox(prefix, rep.last === today);
    text = rest ? `${rest} @${today}` : `@${today}`;
  }
  const next = `${prefix}${text}${cr}`;
  if (next === target) return md;
  lines[line] = next;
  return lines.join("\n");
}
