/**
 * 「AI 文章审核」的提示词与回答解析。纯函数，服务端和单测共用。
 *
 * 界面那套（正文里画标注、右栏出卡片）全靠 quote 逐字对位（见 features/review/locate.ts），
 * 所以这里最要紧的一件事是：模型说的引文必须在正文里一字不差地存在，
 * 对不上的宁可整条丢掉，也不能让界面去标一段并不存在的文字——那会标歪到隔壁句子上。
 *
 * 模型还爱干三件事，这里一并挡掉：把 frontmatter 和代码块当正文挑毛病、
 * 把同一句翻来覆去说好几遍、一口气给你四十条。
 *
 * 审核分两类（见 reviewKinds.ts）：看表述的和看公众号规则的。两类共用上面这套规矩，
 * 各自有自己的「审核要求」（后台可改）与分类清单——「啰嗦」和「诱导关注」不该混在同一排筛选筹码里。
 */
import type { ReviewCategory, ReviewItem, ReviewResult } from "@/features/review/types";
import { DEFAULT_REVIEW_KIND, reviewKindLabel, type ReviewKind } from "./reviewKinds";

/** 表述审核认这几类。模型只许在这几个 id 里选，颜色由前端按 id 取 */
const EXPRESSION_CATEGORIES: ReviewCategory[] = [
  { id: "grammar", label: "语病", color: "#d93025" },
  { id: "verbose", label: "啰嗦", color: "#c2820a" },
  { id: "vague", label: "表述不清", color: "#1a6fd4" },
  { id: "wording", label: "用词", color: "#8e44ad" },
  { id: "logic", label: "逻辑", color: "#c2410c" },
  { id: "fact", label: "事实存疑", color: "#0f766e" },
];

/** 公众号合规审核认这几类：踩的是平台规则，不是文笔 */
const WECHAT_RULES_CATEGORIES: ReviewCategory[] = [
  { id: "clickbait", label: "标题党/夸大", color: "#c2410c" },
  { id: "inducement", label: "诱导行为", color: "#8e44ad" },
  { id: "absolute", label: "绝对化用语", color: "#c2820a" },
  { id: "sensitive", label: "敏感风险", color: "#d93025" },
  { id: "copyright", label: "版权与引用", color: "#0f766e" },
];

/** 一篇最多给几条：再多作者也看不过来 */
export const MAX_AI_ITEMS = 12;
/** 引文太短会在正文里到处撞上（「的」能匹配几十处），太长又几乎必然对不上 */
const MIN_QUOTE = 4;
const MAX_QUOTE = 120;
/** 超过这个长度的正文先截断再送模型：够审一篇公众号长文，也不至于一次烧掉太多 token */
export const MAX_REVIEW_CHARS = 24000;

/** 后台能改的那段提示词最长多少字：够写一份很细的规则清单，也不至于每次审核白烧一大截 token */
export const MAX_GUIDE_CHARS = 6000;

/**
 * 提示词分两段：
 * - 「审核要求」（guide）：你是谁、重点看什么、话怎么说。管理员可以在后台随便改（见 lib/ai/siteSettings），
 *   下面两份 DEFAULT 就是后台里的默认文案，点「恢复默认」回到的也是它们。
 * - 「输出格式」（formatRules）：JSON 形状、分类 id、引文逐字……这些是解析与界面定位的命根子，
 *   改坏一个字整趟审核就解析不出来，所以不开放编辑，由服务端永远接在后面。
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

/** 表述审核的默认「审核要求」 */
const EXPRESSION_GUIDE = [
  "你是一位严格但克制的中文编辑，正在帮作者审一篇要发到微信公众号的文章。",
  "你的任务是挑出文章里真正值得改的地方，并给出可直接替换的改法。",
  "",
  "写法要求：",
  "- problem 用一句话说清楚问题出在哪，像编辑在旁边说话，不要空话套话；",
  "- 能给出明确改法的就给 suggestion，拿不准的只提醒、不硬改；",
  "- summary 用两三句话说全文的整体问题和优点，不要罗列上面每一条。",
].join("\n");

/** 公众号合规审核的默认「审核要求」：照着公众号后台常见的驳回理由与《广告法》忌讳写的 */
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
  /** 默认的「审核要求」；后台改过就用后台那份 */
  guide: string;
  /** 分类认不出来时归到哪一类：整条丢掉太可惜，落进一个说得过去的筐里 */
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
    // 合规这边说不清归哪类的，多半是「这么写有风险」，放进敏感风险里最不容易误导
    fallbackCategory: "sensitive",
  },
};

/** 这一类审核有哪些问题分类（结果里的 categories 从这里挑） */
export function reviewCategories(kind: ReviewKind): ReviewCategory[] {
  return PROMPTS[kind].categories;
}

/** 这一类审核默认的「审核要求」（后台的默认文案） */
export function defaultReviewGuide(kind: ReviewKind): string {
  return PROMPTS[kind].guide;
}

/** 这一类审核固定接在后面的「输出格式」（后台只读展示，让管理员知道不用自己写这些） */
export function reviewFormatRules(kind: ReviewKind): string {
  return formatRules(PROMPTS[kind].categories);
}

/**
 * 这一类审核的系统提示 = 审核要求 + 输出格式。
 * guide 不给（或是空的）就用默认的；格式那段永远在最后，模型更听最后说的。
 */
export function reviewSystemPrompt(kind: ReviewKind, guide?: string): string {
  const body = guide?.trim() || PROMPTS[kind].guide;
  return `${body}\n\n${formatRules(PROMPTS[kind].categories)}`;
}

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
 * 分类按这一类审核自己的清单认，串类的（拿表述那套 id 回答合规审核）一律落到兜底分类。
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
  /** 模型偶尔会拿中文标签当 id 回来，认一下省得整条丢掉 */
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
      byId.get(str(it.category))?.id ?? byLabel.get(str(it.category))?.id ?? spec.fallbackCategory;
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
    (items.length > 0 ? `挑出 ${items.length} 处值得看一眼的地方。` : "这篇没扫到明显要改的地方。");
  return {
    summary,
    // 只留真正用上的分类：工具条上的筛选筹码不该出现「0 条」的那种
    categories: spec.categories.filter((c) => used.has(c.id)),
    items,
  };
}

/** 几类一起审时，其中一类的下场：要么有结果，要么有一句为什么没跑成 */
export type ReviewPart =
  | { kind: ReviewKind; result: ReviewResult }
  | { kind: ReviewKind; error: string };

/**
 * 几类审核各跑各的（各有各的提示词与分类），最后合成一份给界面。
 *
 * - 只审一类时原样返回，跟单选时代一模一样；
 * - 意见按在正文里出现的先后排：作者是顺着文章往下改的，不该先看完一类再回头看另一类；
 * - id 前面带上类型，两类各自的 ai1 不会撞；
 * - 总评按类型分段，各说各的；
 * - 有一类没跑成不连累另一类：成了的照样给，总评里明说哪一类没跑成、为什么。
 *   全都没跑成由调用方处理（这里不会收到那种情况）。
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
