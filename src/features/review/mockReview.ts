/**
 * ⚠️ 原型专用的假数据，整份文件将来会被删掉。
 *
 * 这里不连任何模型、不发任何请求：所有「审核意见」都是本地正则在当前正文上扫出来的，
 * 只为把界面的每一种状态（加载 / 有结果 / 空 / 出错 / 采纳 / 失效）都跑通。
 * 接上服务端时，把 useReview 里对 mockReview 的调用换成一次 fetch 即可——
 * 界面只认 ReviewResult（见 types.ts），别处一行都不用改。
 *
 * 唯一必须守住的约定：每条 quote 都要是某一行源码里逐字存在、且不含 Markdown 记号的片段。
 * 只有这样，同一段文字在渲染结果里也一字不差地存在，才定位得到、高亮得上。
 */

import { parseFrontmatter } from "@/lib/frontmatter";
import { wordCount } from "@/lib/wordCount";
import type { ReviewCategory, ReviewItem, ReviewResult } from "./types";

/** 假装在等模型：不给这么一段等待，加载态根本看不见 */
export const MOCK_DELAY_MS = 1200;

/** 原型里看「出错」态的唯一入口：正文里写上这行注释，这次审核就当失败 */
export const ERROR_MARK = "<!-- review-error -->";

/** 一次最多给这么多条：再多作者也看不过来，界面也堆不下 */
const MAX_ITEMS = 12;
/**
 * 规则挑不够这么多条时，用通用意见补齐（见 fillerItems）。
 *
 * 为什么要补：下面那些规则只认「的的」「其实」「进行 XX」这类现成的毛病，干净的稿子一条都
 * 命中不了——原型于是出现过「0 条建议」的空界面，什么都演示不了。真模型不会这样：它总能
 * 就行文本身说几句。所以这里给一条兜底的路，保证任何有几句散文的文档都摆得出一栏意见。
 */
const MIN_ITEMS = 10;
/** 同一行最多挑几处：不然意见会全堆在最啰嗦的那一段 */
const PER_LINE_MAX = 2;
/** 超过这个字数的句子算「一口气说太长」 */
const LONG_SENTENCE = 60;
/** 短于这个长度的片段不作引文：太短了定位不准，高亮也看不出来 */
const MIN_RUN = 6;

/**
 * 问题类型由「服务端」随结果一起给（前端不写死）。色值按日间白底挑，
 * 夜里前端自己提亮（见 editorMarks.ts 的 reviewMarkCss）。
 */
const CATEGORIES: ReviewCategory[] = [
  { id: "grammar", label: "语病", color: "#d93025" },
  { id: "verbose", label: "啰嗦", color: "#c2820a" },
  { id: "vague", label: "表述不清", color: "#1a6fd4" },
  { id: "wording", label: "用词", color: "#8e44ad" },
];

// —— 第一步：把每行里「可以逐字引用」的片段挑出来 ——

/** 行内的一段文字，at 是它在整行里的起始下标 */
interface Span {
  text: string;
  at: number;
}

/** 这些字符一出现，片段就不再是「渲染后也原样存在」的纯文字了 */
const SYNTAX = new Set([..."#*_`~[]()<>|$\\!{}=+"]);

/** 整段都不能碰的写法：图片、链接、双链、行内代码、行内公式、HTML 标签、裸链接 */
const OPAQUE = [
  /!?\[[^\]]*\]\([^)]*\)/g,
  /\[\[[^\]]*\]\]/g,
  /`[^`]*`/g,
  /\$[^$]*\$/g,
  /<[^>]*>/g,
  /https?:\/\/\S+/g,
  // 两个以上的连续空白：Markdown 里是硬换行，渲染后那几个空格就没了
  /\s{2,}/g,
];

/** 行首的块级记号（标题 # / 引用 > / 列表 - 1. / 表格 |）连同后面的空格 */
const LEAD_MARK = /^[ \t]*(#{1,6}[ \t]+|>+[ \t]*|[-*+][ \t]+|\d+[.)][ \t]+|\|)/;

/**
 * 一行里所有「逐字引得起」的片段。
 * 做法是给整行打一张「不可用」的掩码，再把剩下的连续段落收起来：
 * 记号本身、记号包住的内容、行首的块级标记，全部标掉。
 */
export function safeRuns(line: string): Span[] {
  const bad = new Uint8Array(line.length);
  const mark = (from: number, to: number) => {
    for (let i = Math.max(0, from); i < Math.min(line.length, to); i++) bad[i] = 1;
  };
  for (const re of OPAQUE) {
    for (const m of line.matchAll(re)) mark(m.index ?? 0, (m.index ?? 0) + m[0].length);
  }
  const lead = line.match(LEAD_MARK);
  if (lead) mark(0, lead[0].length);
  for (let i = 0; i < line.length; i++) {
    if (SYNTAX.has(line[i])) bad[i] = 1;
  }

  const runs: Span[] = [];
  let start = -1;
  for (let i = 0; i <= line.length; i++) {
    const usable = i < line.length && bad[i] === 0;
    if (usable && start === -1) start = i;
    if (!usable && start !== -1) {
      const raw = line.slice(start, i);
      const head = raw.length - raw.trimStart().length;
      const text = raw.trim();
      if (text.length >= MIN_RUN) runs.push({ text, at: start + head });
      start = -1;
    }
  }
  return runs;
}

/** 按分隔符把片段切开（分隔符本身不进结果），偏移跟着一起算好 */
function splitBy(span: Span, sep: RegExp): Span[] {
  const out: Span[] = [];
  let start = 0;
  for (let i = 0; i <= span.text.length; i++) {
    if (i < span.text.length && !sep.test(span.text[i])) continue;
    const raw = span.text.slice(start, i);
    const head = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text) out.push({ text, at: span.at + start + head });
    start = i + 1;
  }
  return out;
}

const SENTENCE_SEP = /[。！？!?…]/;
const CLAUSE_SEP = /[，、；：,;:]/;

// —— 第二步：在片段上按规则挑毛病 ——

interface Candidate {
  line: number;
  /** 引文在这一行里的起始下标：规则命中与兜底意见合到一起后，按它排回原文顺序 */
  at: number;
  quote: string;
  category: string;
  problem: string;
  suggestion?: string;
}

/** 一条短句级的规则：命中就出一条意见，fix 给得出改写就顺带给「采纳」 */
interface ClauseRule {
  category: string;
  /** 不带 g：只看第一处命中 */
  re: RegExp;
  problem: string;
  fix?: (clause: string, m: RegExpMatchArray) => string;
}

/** 删掉命中的那一段，前后接起来 */
const dropMatch = (clause: string, m: RegExpMatchArray) =>
  clause.slice(0, m.index ?? 0) + clause.slice((m.index ?? 0) + m[0].length);

/** 口水词：删掉句子只会更硬 */
const FILLERS: { word: string; problem: string }[] = [
  { word: "其实", problem: "「其实」几乎不承担意思，删掉句子更直接" },
  { word: "然后", problem: "「然后」是口语里的连接词，书面语里多半可以删" },
  { word: "的话", problem: "「的话」是口头语，去掉更利落" },
  { word: "可以说", problem: "「可以说」是缓冲词，删掉不影响判断" },
  { word: "基本上", problem: "「基本上」把话说虚了，要么删掉要么给个范围" },
  { word: "实际上", problem: "「实际上」多半是垫话，删掉句子更硬" },
  { word: "事实上", problem: "「事实上」多半是垫话，删掉句子更硬" },
  { word: "非常", problem: "「非常」是最省事的程度词，删掉或换个具体说法" },
  { word: "我们知道", problem: "「我们知道」是开场垫话，直接说结论" },
  { word: "总的来说", problem: "「总的来说」是凑字的起头，直接说结论" },
];

const RULES: ClauseRule[] = [
  {
    category: "grammar",
    re: /的的/,
    problem: "「的的」重复了",
    fix: (clause) => clause.replace("的的", "的"),
  },
  {
    category: "grammar",
    re: /([一-龥]{2})\1/,
    problem: "同一个词连着写了两遍",
    fix: (clause, m) => clause.replace(m[0], m[1]),
  },
  {
    category: "wording",
    re: /(快速|顺利|成功|自动|认真|仔细|慢慢|轻松|完整|彻底)的(?=[一-龥])/,
    problem: "修饰动作要用「地」，不是「的」",
    fix: (clause, m) => clause.replace(m[0], `${m[1]}地`),
  },
  {
    category: "wording",
    re: /进行(?=[一-龥]{2})/,
    problem: "「进行 XX」是公文腔，直接说「XX」就行",
    fix: dropMatch,
  },
  ...FILLERS.map<ClauseRule>(({ word, problem }) => ({
    category: "verbose",
    re: new RegExp(word),
    problem,
    fix: dropMatch,
  })),
  {
    // 故意只提意见、不给改写：这类翻译腔的「一个」删不删得看上下文。
    // 顺带也让界面跑一遍「没有建议可采纳」的卡片（只有「知道了」和「忽略」）。
    category: "verbose",
    re: /一个/,
    problem: "「一个」常是翻译腔，看看去掉读起来是不是更顺",
  },
];

/** 短句上跑一遍规则，第一条命中的算数 */
function matchClause(clause: string): Omit<Candidate, "line" | "at"> | null {
  for (const rule of RULES) {
    const m = clause.match(rule.re);
    if (!m) continue;
    const fixed = rule.fix?.(clause, m).trim();
    if (rule.fix && (!fixed || fixed === clause)) continue; // 改写不出东西就别提
    return {
      quote: clause,
      category: rule.category,
      problem: rule.problem,
      suggestion: fixed || undefined,
    };
  }
  return null;
}

/** 叠标点：「，，」「。。」这类，多半是打字时手抖 */
const DUP_PUNCT = /([，。！？；、,!?;])\1+/g;
/** 取引文时向两侧扩到最近的标点为止 */
const ANY_PUNCT = /[，。！？；、：,.!?;:]/;

/** 扫一行里的叠标点；add 返回 false 表示这一行已经够了 */
function scanDupPunct(run: Span, line: number, add: (c: Candidate) => boolean): boolean {
  for (const m of run.text.matchAll(DUP_PUNCT)) {
    const at = m.index ?? 0;
    let start = at;
    while (start > 0 && !ANY_PUNCT.test(run.text[start - 1])) start--;
    let end = at + m[0].length;
    while (end < run.text.length && !ANY_PUNCT.test(run.text[end])) end++;
    const raw = run.text.slice(start, end);
    const quote = raw.trim();
    const fixed = (
      run.text.slice(start, at) +
      m[1] +
      run.text.slice(at + m[0].length, end)
    ).trim();
    if (!quote || quote === fixed) continue;
    const head = raw.length - raw.trimStart().length;
    if (
      !add({
        line,
        at: run.at + start + head,
        quote,
        category: "grammar",
        problem: "标点重复了",
        suggestion: fixed,
      })
    ) {
      return false;
    }
  }
  return true;
}

/** 一行里挑得出的整句，兜底意见从这些句子里选（见 fillerFor） */
interface PoolItem extends Span {
  line: number;
}

/** 扫一行：挑出的毛病交给 add，顺带把这一行所有成句的片段收进 pool 备用 */
function scanLine(
  raw: string,
  line: number,
  add: (c: Candidate) => void,
  pool: PoolItem[]
): void {
  let taken = 0;
  /** 收下一条；返回 false 表示这一行的配额用完了 */
  const take = (c: Candidate) => {
    if (taken >= PER_LINE_MAX) return false;
    taken++;
    add(c);
    return true;
  };
  let quotaLeft = true;
  for (const run of safeRuns(raw)) {
    for (const sentence of splitBy(run, SENTENCE_SEP)) {
      if (sentence.text.length >= FILLER_MIN) pool.push({ ...sentence, line });
    }
    if (!quotaLeft) continue; // 配额用完了也要把这一行剩下的句子收进 pool
    if (!scanDupPunct(run, line, take)) {
      quotaLeft = false;
      continue;
    }
    for (const sentence of splitBy(run, SENTENCE_SEP)) {
      if (sentence.text.length > LONG_SENTENCE) {
        // 长句只提意见不给改写：怎么拆是作者的事
        const problem = `这句话一口气写了 ${sentence.text.length} 个字，读到后半句已经忘了前半句，建议拆成两三句`;
        if (!take({ line, at: sentence.at, quote: sentence.text, category: "vague", problem })) {
          quotaLeft = false;
          break;
        }
        continue;
      }
      for (const clause of splitBy(sentence, CLAUSE_SEP)) {
        if (clause.text.length < MIN_RUN) continue;
        const hit = matchClause(clause.text);
        if (hit && !take({ line, at: clause.at, ...hit })) {
          quotaLeft = false;
          break;
        }
      }
      if (!quotaLeft) break;
    }
  }
}

// —— 第三步：规则挑不够时的兜底意见 ——

/** 短于这个字数的句子不拿来当兜底引文：太碎，说不出什么 */
const FILLER_MIN = 12;

/** 一条兜底意见：拿整句说事。give 返回 null 表示这句不适合套这个模板 */
interface FillerTemplate {
  category: string;
  problem: string;
  /** 给得出改写就给（卡片上会出现「采纳」），给不出就只是提个意见 */
  rewrite?: (sentence: string) => string | null;
}

/** 第一个逗号的位置（前后都得有实质内容才算数） */
function firstComma(sentence: string): number {
  for (let i = 2; i < sentence.length - 2; i++) {
    if (CLAUSE_SEP.test(sentence[i])) return i;
  }
  return -1;
}

/**
 * 兜底模板。真模型评稿本来就是「这句可以更紧一点」这类话，这里照着那个语气编几条，
 * 轮着用——同一份正文永远得到同一批意见（不掷骰子），单测才立得住。
 */
const FILLERS_GENERIC: FillerTemplate[] = [
  {
    category: "vague",
    problem: "这句里塞了两件事，中间断开成两句，读者不用一口气吞下去",
    rewrite: (s) => {
      const i = firstComma(s);
      return i === -1 ? null : `${s.slice(0, i)}。${s.slice(i + 1)}`;
    },
  },
  {
    category: "verbose",
    problem: "开头这半句是铺垫，删掉直接说正事更有力",
    rewrite: (s) => {
      const i = firstComma(s);
      // 只削很短的那种起手式，长的半句多半是正经内容
      return i === -1 || i > 8 ? null : s.slice(i + 1);
    },
  },
  {
    category: "vague",
    problem: "这句的意思能猜到，但没说透：补一个具体的数字或例子，读者才接得住",
  },
  {
    category: "wording",
    problem: "这句的用词偏书面，换成平时说话的说法会更亲切",
  },
  {
    category: "verbose",
    problem: "这句和上文说的是同一件事，留下更利落的那一句就够了",
  },
  {
    category: "vague",
    problem: "这句是结论，但没给理由；紧跟一句依据，说服力差别很大",
  },
];

/** 给一个句子套一条兜底意见：从第 seed 条模板起找第一条套得上的 */
function fillerFor(item: PoolItem, seed: number): Candidate {
  for (let k = 0; k < FILLERS_GENERIC.length; k++) {
    const t = FILLERS_GENERIC[(seed + k) % FILLERS_GENERIC.length];
    const fixed = t.rewrite?.(item.text)?.trim();
    if (t.rewrite && (!fixed || fixed === item.text)) continue;
    return {
      line: item.line,
      at: item.at,
      quote: item.text,
      category: t.category,
      problem: t.problem,
      ...(fixed ? { suggestion: fixed } : {}),
    };
  }
  // 上面那几条改写型的都套不上（这句里没有逗号），退到纯意见的第一条
  const t = FILLERS_GENERIC.find((x) => !x.rewrite) ?? FILLERS_GENERIC[0];
  return {
    line: item.line,
    at: item.at,
    quote: item.text,
    category: t.category,
    problem: t.problem,
  };
}

/** 多于 max 条时按下标等距挑，让意见摊开在全篇而不是挤在开头 */
function spread<T>(list: T[], max: number): T[] {
  if (max <= 0) return [];
  if (list.length <= max) return list;
  if (max === 1) return [list[Math.floor((list.length - 1) / 2)]];
  const out: T[] = [];
  for (let i = 0; i < max; i++) {
    out.push(list[Math.round((i * (list.length - 1)) / (max - 1))]);
  }
  return out;
}

function buildSummary(chars: number, items: ReviewItem[]): string {
  const tail = "（原型演示：这份结果由本地规则模拟，接上模型后会换成真正的审核意见。）";
  if (items.length === 0) {
    return `全文约 ${chars} 字，通读一遍没扫到明显要改的地方，行文挺干净。真要再打磨，可以自己盯一下段落之间的过渡。${tail}`;
  }
  const count = new Map<string, number>();
  for (const it of items) count.set(it.category, (count.get(it.category) ?? 0) + 1);
  const top = CATEGORIES.filter((c) => count.has(c.id))
    .sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0))
    .slice(0, 2)
    .map((c) => `${c.label} ${count.get(c.id)} 处`)
    .join("、");
  return `全文约 ${chars} 字，挑出 ${items.length} 处可以再打磨的地方，主要集中在${top}。建议按「下一条」把高亮的句子过一遍，能直接换的点「采纳」，不认同的点「忽略」。${tail}`;
}

/**
 * 扫描正文，造出一份审核结果。同样的正文必然得到同样的结果（纯函数，不掷骰子）。
 * 导出它是为了单测能同步跑，界面走下面那个带延迟的 mockReview。
 */
export function buildReview(content: string): ReviewResult {
  const fm = parseFrontmatter(content);
  // frontmatter 是给机器看的元数据，不是正文：跳过它占的那几行，行号仍按整篇算
  const startLine = fm ? content.slice(0, fm.end).split("\n").length - 1 : 0;
  const lines = content.split("\n");

  const found: Candidate[] = [];
  const pool: PoolItem[] = [];
  const seen = new Set<string>();
  const add = (c: Candidate) => {
    const key = `${c.line}\u0000${c.quote}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(c);
  };

  let fenced = false;
  let mathBlock = false;
  for (let i = startLine; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (/^\s*\$\$\s*$/.test(raw)) {
      mathBlock = !mathBlock;
      continue;
    }
    if (mathBlock) continue;
    scanLine(raw, i, add, pool);
  }

  const picked = spread(found, MAX_ITEMS);
  // 规则挑不够就拿整句说事：干净的稿子也不该是一片空白（见 MIN_ITEMS）
  if (picked.length < MIN_ITEMS) {
    const overlaps = (p: PoolItem) =>
      picked.some(
        (c) => c.line === p.line && p.at < c.at + c.quote.length && c.at < p.at + p.text.length
      );
    const free = pool.filter((p) => !overlaps(p));
    spread(free, MIN_ITEMS - picked.length).forEach((p, i) => picked.push(fillerFor(p, i)));
  }
  picked.sort((a, b) => a.line - b.line || a.at - b.at);

  const items: ReviewItem[] = picked.map((c, i) => ({
    id: `rv${i + 1}`,
    category: c.category,
    quote: c.quote,
    line: c.line,
    problem: c.problem,
    ...(c.suggestion ? { suggestion: c.suggestion } : {}),
  }));

  return {
    summary: buildSummary(wordCount(content), items),
    categories: CATEGORIES,
    items,
  };
}

/** 界面用的入口：等一会儿再给结果，好让加载态真的能被看见 */
export function mockReview(content: string, delayMs = MOCK_DELAY_MS): Promise<ReviewResult> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (content.includes(ERROR_MARK)) {
        reject(new Error("审核服务没有响应（原型：正文里写了 review-error 标记）"));
        return;
      }
      resolve(buildReview(content));
    }, delayMs);
  });
}
