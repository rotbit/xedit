/**
 * 「AI 文章审核」的提示词与回答解析。纯函数，服务端和单测共用。
 *
 * 界面那套（正文里画标注、右栏出卡片）全靠 quote 逐字对位（见 features/review/locate.ts），
 * 所以这里最要紧的一件事是：模型说的引文必须在正文里一字不差地存在，
 * 对不上的宁可整条丢掉，也不能让界面去标一段并不存在的文字——那会标歪到隔壁句子上。
 *
 * 模型还爱干三件事，这里一并挡掉：把 frontmatter 和代码块当正文挑毛病、
 * 把同一句翻来覆去说好几遍、一口气给你四十条。
 */
import type { ReviewCategory, ReviewItem, ReviewResult } from "@/features/review/types";

/** 认这几类。模型只许在这几个 id 里选，颜色由前端按 id 取（与 mockReview 同一套配色） */
export const AI_CATEGORIES: ReviewCategory[] = [
  { id: "grammar", label: "语病", color: "#d93025" },
  { id: "verbose", label: "啰嗦", color: "#c2820a" },
  { id: "vague", label: "表述不清", color: "#1a6fd4" },
  { id: "wording", label: "用词", color: "#8e44ad" },
  { id: "logic", label: "逻辑", color: "#c2410c" },
  { id: "fact", label: "事实存疑", color: "#0f766e" },
];

const BY_ID = new Map(AI_CATEGORIES.map((c) => [c.id, c]));
/** 模型偶尔会拿中文标签当 id 回来，认一下省得整条丢掉 */
const BY_LABEL = new Map(AI_CATEGORIES.map((c) => [c.label, c]));

/** 一篇最多给几条：再多作者也看不过来，和 mockReview 的上限保持一致 */
export const MAX_AI_ITEMS = 12;
/** 引文太短会在正文里到处撞上（「的」能匹配几十处），太长又几乎必然对不上 */
const MIN_QUOTE = 4;
const MAX_QUOTE = 120;
/** 超过这个长度的正文先截断再送模型：够审一篇公众号长文，也不至于一次烧掉太多 token */
export const MAX_REVIEW_CHARS = 24000;

export const REVIEW_SYSTEM_PROMPT = [
  "你是一位严格但克制的中文编辑，正在帮作者审一篇要发到微信公众号的文章。",
  "你的任务是挑出文章里真正值得改的地方，并给出可直接替换的改法。",
  "",
  "必须遵守：",
  "1. 只输出一个 JSON 对象，不要写任何解释、前言或 Markdown 代码块。",
  '2. JSON 形状：{"summary": "一段总评", "items": [{"category": "...", "quote": "...", "problem": "...", "suggestion": "..."}]}',
  `3. category 只能是这几个之一：${AI_CATEGORIES.map((c) => `${c.id}（${c.label}）`).join("、")}。`,
  "4. quote 必须是原文里一字不差、连续存在的一小段（含标点），长度控制在 4～40 个字，",
  "   不要跨行，不要自己改写，不要加省略号，不要带 Markdown 语法记号。",
  "5. problem 用一句话说清楚问题出在哪，像编辑在旁边说话，不要空话套话。",
  "6. suggestion 是把 quote 整段替换掉之后的文字；如果这条只是提醒、没有明确改法，就不要这个字段。",
  "7. 不要点评 frontmatter（--- 之间的元数据）、代码块、图片和链接地址。",
  "8. 同一句话只说一次，最多给 12 条，按重要程度从高到低排。",
  "9. summary 用两三句话说全文的整体问题和优点，不要罗列上面每一条。",
].join("\n");

/** 正文太长就掐掉尾巴：截断点落在换行处，别把一句话劈成两半 */
export function clipForReview(content: string, max = MAX_REVIEW_CHARS): string {
  if (content.length <= max) return content;
  const head = content.slice(0, max);
  const at = head.lastIndexOf("\n");
  return at > max * 0.6 ? head.slice(0, at) : head;
}

/** 给模型看的那一段：带上行号，模型更容易挑出完整的一句而不是半句 */
export function buildReviewUserPrompt(content: string): string {
  return [
    "下面是文章全文（每行前面的数字是行号，只是给你定位用，不要出现在 quote 里）：",
    "",
    clipForReview(content)
      .split("\n")
      .map((line, i) => `${i}\t${line}`)
      .join("\n"),
    "",
    "请按系统提示的 JSON 格式给出审核结果。",
  ].join("\n");
}

/**
 * 从模型的回答里把 JSON 抠出来。
 * 开了 JSON 模式的那几家直接就是一个对象，没开的会裹一层 ```json，
 * 还有的会在前面客气两句，所以按「第一个 { 到最后一个 }」兜底。
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], trimmed];
  for (const one of candidates) {
    if (!one) continue;
    const body = one.trim();
    const from = body.indexOf("{");
    const to = body.lastIndexOf("}");
    if (from === -1 || to <= from) continue;
    try {
      return JSON.parse(body.slice(from, to + 1));
    } catch {
      // 换下一个候选；都不行的话由调用方报「解析不出来」
    }
  }
  return null;
}

/** 正文里不该被标注的行：frontmatter 与围栏代码块 */
function skipLines(lines: string[]): Set<number> {
  const skip = new Set<number>();
  let i = 0;
  // frontmatter 只认开头第一行就是 --- 的那种
  if (lines[0]?.trim() === "---") {
    skip.add(0);
    for (i = 1; i < lines.length; i++) {
      skip.add(i);
      if (lines[i].trim() === "---") {
        i++;
        break;
      }
    }
  }
  let fence: string | null = null;
  for (; i < lines.length; i++) {
    const mark = lines[i].match(/^\s*(```|~~~)/)?.[1] ?? null;
    if (fence) {
      skip.add(i);
      if (mark === fence) fence = null;
      continue;
    }
    if (mark) {
      fence = mark;
      skip.add(i);
    }
  }
  return skip;
}

/** 引文落在哪一行：优先信模型给的行号，对不上就全篇找第一处 */
function findLine(lines: string[], quote: string, hint: unknown): number {
  const at = typeof hint === "number" && Number.isFinite(hint) ? Math.floor(hint) : -1;
  if (at >= 0 && at < lines.length && lines[at].includes(quote)) return at;
  return lines.findIndex((line) => line.includes(quote));
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * 模型的回答 → 界面认的 ReviewResult。
 *
 * 解析不出 JSON 会抛错（调用方据此提示「模型没按格式回答」）；
 * 单条不合格只丢这一条——十条里有一条跑偏，不该让另外九条一起白跑。
 */
export function parseReviewResult(text: string, content: string): ReviewResult {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("模型没有按格式回答，换个模型或重试一次");
  }
  const raw = parsed as { summary?: unknown; items?: unknown };
  const lines = content.split("\n");
  const skip = skipLines(lines);
  const seen = new Set<string>();
  const items: ReviewItem[] = [];

  for (const one of Array.isArray(raw.items) ? raw.items : []) {
    if (items.length >= MAX_AI_ITEMS) break;
    if (!one || typeof one !== "object") continue;
    const it = one as Record<string, unknown>;
    const quote = str(it.quote);
    // 引文得像句话，且必须逐字在正文里——对不上的标不出来，只会标歪
    if (quote.length < MIN_QUOTE || quote.length > MAX_QUOTE) continue;
    if (quote.includes("\n")) continue;
    const line = findLine(lines, quote, it.line);
    if (line === -1 || skip.has(line)) continue;
    const problem = str(it.problem);
    if (!problem) continue;
    // 同一段引文说两遍就只留第一遍
    if (seen.has(quote)) continue;
    seen.add(quote);

    const category =
      BY_ID.get(str(it.category))?.id ?? BY_LABEL.get(str(it.category))?.id ?? "wording";
    const suggestion = str(it.suggestion);
    items.push({
      id: `ai${items.length + 1}`,
      category,
      quote,
      line,
      problem,
      // 建议和原文一模一样等于没建议，卡片上就不该出现「采纳」
      ...(suggestion && suggestion !== quote ? { suggestion } : {}),
    });
  }

  const used = new Set(items.map((it) => it.category));
  const summary =
    str(raw.summary) ||
    (items.length > 0 ? `挑出 ${items.length} 处可以再打磨的地方。` : "这篇没扫到明显要改的地方。");
  return {
    summary,
    // 只留真正用上的分类：工具条上的筛选筹码不该出现「0 条」的那种
    categories: AI_CATEGORIES.filter((c) => used.has(c.id)),
    items,
  };
}
