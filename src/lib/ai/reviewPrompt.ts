/**
 * Prompts and response parsing for "AI article review". Pure functions, shared by the server and unit tests.
 *
 * The UI (annotations in the body, cards in the right column) relies entirely on quotes matching verbatim (see features/review/locate.ts),
 * so the most important thing here is: every quote from the model must exist in the body exactly,
 * and anything that doesn't match is dropped entirely rather than letting the UI mark text that doesn't exist -- it would land on the neighboring sentence.
 *
 * Models also love three other things, all blocked here: nitpicking frontmatter and code blocks as if they were body text,
 * repeating the same point over and over, and dumping forty comments at once.
 *
 * There are two review kinds (see reviewKinds.ts): writing and WeChat Official Account rules. Both share the rules above,
 * each with its own "review guide" (editable in admin) and category list -- "wordy" and "baiting follows" shouldn't share one row of filter chips.
 */
import type { ReviewCategory, ReviewItem, ReviewResult } from "@/features/review/types";
import { DEFAULT_REVIEW_KIND, reviewKindLabel, type ReviewKind } from "./reviewKinds";

/** Categories for writing review. The model may only choose from these ids; the frontend picks colors by id */
const EXPRESSION_CATEGORIES: ReviewCategory[] = [
  { id: "grammar", label: "语病", color: "#d93025" },
  { id: "verbose", label: "啰嗦", color: "#c2820a" },
  { id: "vague", label: "表述不清", color: "#1a6fd4" },
  { id: "wording", label: "用词", color: "#8e44ad" },
  { id: "logic", label: "逻辑", color: "#c2410c" },
  { id: "fact", label: "事实存疑", color: "#0f766e" },
];

/** Categories for WeChat compliance review: platform rule violations, not writing style */
const WECHAT_RULES_CATEGORIES: ReviewCategory[] = [
  { id: "clickbait", label: "标题党/夸大", color: "#c2410c" },
  { id: "inducement", label: "诱导行为", color: "#8e44ad" },
  { id: "absolute", label: "绝对化用语", color: "#c2820a" },
  { id: "sensitive", label: "敏感风险", color: "#d93025" },
  { id: "copyright", label: "版权与引用", color: "#0f766e" },
];

/** Max comments per article: more than this is more than an author can get through */
export const MAX_AI_ITEMS = 12;
/** Quotes that are too short collide all over the body (「的」 matches dozens of places); too long and they almost never match */
const MIN_QUOTE = 4;
const MAX_QUOTE = 120;
/** Bodies longer than this are truncated before sending: enough for a long WeChat article without burning too many tokens at once */
export const MAX_REVIEW_CHARS = 24000;

/** Max length of the admin-editable prompt section: enough for a very detailed rule list without wasting tokens on every review */
export const MAX_GUIDE_CHARS = 6000;

/**
 * The prompt has two parts:
 * - "Review guide" (guide): who you are, what to focus on, how to phrase things. Admins can edit it freely (see lib/ai/siteSettings);
 *   the two DEFAULTs below are the admin defaults, and 「恢复默认」 (Restore default) returns to them.
 * - "Output format" (formatRules): JSON shape, category ids, verbatim quotes... these are the lifeline of parsing and UI positioning;
 *   one wrong character and the whole run can't be parsed, so it isn't editable and the server always appends it.
 */
function formatRules(cats: ReviewCategory[]): string {
  return [
    "输出格式（必须遵守，与上文冲突时以这里为准）：",
    "1. 只输出一个 JSON 对象，不要写任何解释、前言或 Markdown 代码块。",
    '2. JSON 形状：{"summary": "一段总评", "items": [{"category": "...", "quote": "...", "problem": "...", "suggestion": "..."}]}',
    `3. category 只能是这几个之一：${cats.map((c) => `${c.id}（${c.label}）`).join("、")}。`,
    "4. quote 必须是原文里一字不差、连续存在的一小段（含标点），长度控制在 4～40 个字，",
    "   不要跨行，不要自己改写，不要加省略号，不要带 Markdown 语法记号。",
    "5. suggestion 是把 quote 整段替换掉之后的文字；这条只是提醒、没有明确改法时，就不要这个字段。",
    "6. 不要点评 frontmatter（--- 之间的元数据）、代码块、图片和链接地址。",
    `7. 同一句话只说一次，最多给 ${MAX_AI_ITEMS} 条，按重要程度从高到低排。`,
  ].join("\n");
}

/** Default "review guide" for writing review */
const EXPRESSION_GUIDE = [
  "你是一位严格但克制的中文编辑，正在帮作者审一篇要发到微信公众号的文章。",
  "你的任务是挑出文章里真正值得改的地方，并给出可直接替换的改法。",
  "",
  "写法要求：",
  "- problem 用一句话说清楚问题出在哪，像编辑在旁边说话，不要空话套话；",
  "- 能给出明确改法的就给 suggestion，拿不准的只提醒、不硬改；",
  "- summary 用两三句话说全文的整体问题和优点，不要罗列上面每一条。",
].join("\n");

/** Default "review guide" for WeChat compliance review: based on common WeChat backend rejection reasons and Advertising Law taboos */
const WECHAT_RULES_GUIDE = [
  "你是微信公众号的内容合规审核员，正在帮作者检查一篇马上要群发的文章。",
  "你的任务是找出可能违反公众号平台规则、会被限流、删文或驳回的地方，只说风险，不评文笔。",
  "",
  "重点看这几类：",
  "- 标题党 / 夸大：标题或开头与正文不符、卖悬念骗点击、震惊体、对效果打包票；",
  "- 诱导行为：诱导分享 / 转发 / 关注 / 点赞 / 在看 / 打赏 / 加群，「转发可得」「不转不是……」这类；",
  "- 绝对化用语：最、第一、顶级、国家级、100%、永久、绝无仅有等《广告法》忌讳的说法；",
  "- 敏感风险：医疗保健的疗效承诺、投资理财的收益承诺、未经证实的传言、涉政涉黄涉赌、",
  "  人身攻击与地域歧视、暴露他人隐私；",
  "- 版权与引用：整段搬运他人文章、引用不注明出处、用来路不明的图片或音乐。",
  "",
  "写法要求：",
  "- problem 用一句话说清楚这句踩了哪条规则、可能的后果（限流 / 删文 / 不给推荐）；",
  "- 只有改法明摆着（比如把绝对化用语换成有限定的说法）时才给 suggestion，",
  "  拿不准怎么改就不给，让作者自己拿主意；",
  "- summary 用两三句话说这篇整体的合规风险，有没有必须改掉的硬伤。",
].join("\n");

interface KindPrompt {
  categories: ReviewCategory[];
  /** Default "review guide"; if admin changed it, use theirs */
  guide: string;
  /** Category to fall back to when unrecognized: dropping the whole item is a waste, so put it in a reasonable bucket */
  fallbackCategory: string;
}

const PROMPTS: Record<ReviewKind, KindPrompt> = {
  expression: {
    categories: EXPRESSION_CATEGORIES,
    guide: EXPRESSION_GUIDE,
    fallbackCategory: "wording",
  },
  wechat_rules: {
    categories: WECHAT_RULES_CATEGORIES,
    guide: WECHAT_RULES_GUIDE,
    // Compliance items with an unclear category are usually "this wording is risky", so sensitive risk is the least misleading home
    fallbackCategory: "sensitive",
  },
};

/** Problem categories for this review kind (categories in the result are chosen from here) */
export function reviewCategories(kind: ReviewKind): ReviewCategory[] {
  return PROMPTS[kind].categories;
}

/** Default "review guide" for this kind (the admin default text) */
export function defaultReviewGuide(kind: ReviewKind): string {
  return PROMPTS[kind].guide;
}

/** The fixed "output format" appended for this kind (shown read-only in admin so admins know they needn't write it) */
export function reviewFormatRules(kind: ReviewKind): string {
  return formatRules(PROMPTS[kind].categories);
}

/**
 * System prompt for this kind = review guide + output format.
 * If guide is missing (or empty), use the default; the format section always goes last because models heed what's said last.
 */
export function reviewSystemPrompt(kind: ReviewKind, guide?: string): string {
  const body = guide?.trim() || PROMPTS[kind].guide;
  return `${body}\n\n${formatRules(PROMPTS[kind].categories)}`;
}

/** Trim the tail of overly long bodies: cut at a line break so a sentence isn't split in half */
export function clipForReview(content: string, max = MAX_REVIEW_CHARS): string {
  if (content.length <= max) return content;
  const head = content.slice(0, max);
  const at = head.lastIndexOf("\n");
  return at > max * 0.6 ? head.slice(0, at) : head;
}

/** The part shown to the model: with line numbers, so it picks out whole sentences rather than half ones */
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
 * Extracts the JSON from the model's reply.
 * Providers with JSON mode on return a bare object; others wrap it in ```json,
 * and some add pleasantries first, so fall back to "first { to last }".
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
      // Try the next candidate; if none work, the caller reports "couldn't parse"
    }
  }
  return null;
}

/** Body lines that shouldn't be annotated: frontmatter and fenced code blocks */
function skipLines(lines: string[]): Set<number> {
  const skip = new Set<number>();
  let i = 0;
  // Frontmatter only counts when the very first line is ---
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

/** Which line a quote is on: trust the model's line number first, otherwise find the first match in the whole doc */
function findLine(lines: string[], quote: string, hint: unknown): number {
  const at = typeof hint === "number" && Number.isFinite(hint) ? Math.floor(hint) : -1;
  if (at >= 0 && at < lines.length && lines[at].includes(quote)) return at;
  return lines.findIndex((line) => line.includes(quote));
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Model reply → the ReviewResult the UI understands.
 *
 * Throws if no JSON can be parsed (the caller shows "the model didn't follow the format");
 * a single invalid item only drops that item -- one bad comment out of ten shouldn't waste the other nine.
 * Categories are matched against this kind's own list; cross-kind ones (answering compliance review with writing ids) fall into the fallback category.
 */
export function parseReviewResult(
  text: string,
  content: string,
  kind: ReviewKind = DEFAULT_REVIEW_KIND
): ReviewResult {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("模型没有按格式回答，换个模型或重试一次");
  }
  const spec = PROMPTS[kind] ?? PROMPTS[DEFAULT_REVIEW_KIND];
  const byId = new Map(spec.categories.map((c) => [c.id, c]));
  /** The model occasionally returns the Chinese label as the id; accept it rather than dropping the item */
  const byLabel = new Map(spec.categories.map((c) => [c.label, c]));
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
    // The quote must read like a sentence and appear verbatim in the body -- unmatched quotes can't be marked, only mismarked
    if (quote.length < MIN_QUOTE || quote.length > MAX_QUOTE) continue;
    if (quote.includes("\n")) continue;
    const line = findLine(lines, quote, it.line);
    if (line === -1 || skip.has(line)) continue;
    const problem = str(it.problem);
    if (!problem) continue;
    // Keep only the first occurrence of a repeated quote
    if (seen.has(quote)) continue;
    seen.add(quote);

    const category =
      byId.get(str(it.category))?.id ?? byLabel.get(str(it.category))?.id ?? spec.fallbackCategory;
    const suggestion = str(it.suggestion);
    items.push({
      id: `ai${items.length + 1}`,
      category,
      quote,
      line,
      problem,
      // A suggestion identical to the original is no suggestion, so the card shouldn't offer 「采纳」 (Accept)
      ...(suggestion && suggestion !== quote ? { suggestion } : {}),
    });
  }

  const used = new Set(items.map((it) => it.category));
  const summary =
    str(raw.summary) ||
    (items.length > 0 ? `挑出 ${items.length} 处值得看一眼的地方。` : "这篇没扫到明显要改的地方。");
  return {
    summary,
    // Keep only categories actually used: the toolbar's filter chips shouldn't show "0 items"
    categories: spec.categories.filter((c) => used.has(c.id)),
    items,
  };
}

/** Outcome of one kind when several are reviewed together: either a result or a reason it didn't run */
export type ReviewPart =
  | { kind: ReviewKind; result: ReviewResult }
  | { kind: ReviewKind; error: string };

/**
 * Each review kind runs on its own (own prompt and categories), then they're merged into one for the UI.
 *
 * - With a single kind, return it unchanged, exactly like the single-select days;
 * - comments are ordered by position in the body: authors edit top to bottom, not one kind and then back for the other;
 * - ids are prefixed with the kind, so each kind's ai1 doesn't collide;
 * - the summary is split by kind, each saying its own piece;
 * - one kind failing doesn't sink the other: successful ones are still returned, and the summary says which failed and why.
 *   The caller handles the case where all of them fail (it never reaches here).
 */
export function mergeReviewResults(parts: ReviewPart[]): ReviewResult {
  const done = parts.filter((p): p is { kind: ReviewKind; result: ReviewResult } => "result" in p);
  if (parts.length === 1 && done.length === 1) return done[0].result;

  const items = done
    .flatMap((p) => p.result.items.map((it) => ({ ...it, id: `${p.kind}-${it.id}` })))
    .sort((a, b) => a.line - b.line);
  const summary = parts
    .map((p) =>
      "result" in p
        ? `【${reviewKindLabel(p.kind)}】${p.result.summary}`
        : `【${reviewKindLabel(p.kind)}】这一类没跑成：${p.error}`
    )
    .join("\n\n");
  return { summary, categories: done.flatMap((p) => p.result.categories), items };
}
