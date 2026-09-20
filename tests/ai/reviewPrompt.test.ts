import { describe, expect, it } from "vitest";

import {
  DEFAULT_REVIEW_KIND,
  isReviewKind,
  REVIEW_KINDS,
  reviewKindLabel,
} from "@/lib/ai/reviewKinds";
import {
  buildReviewUserPrompt,
  clipForReview,
  extractJson,
  MAX_AI_ITEMS,
  parseReviewResult,
  reviewCategories,
  reviewSystemPrompt,
} from "@/lib/ai/reviewPrompt";

/**
 * 模型的回答是这条链路上唯一不受我们控制的一环：它会裹代码块、会客气两句再给 JSON、
 * 会把引文改写得更顺口、会把代码块里的行也挑出来说。
 * 这一组用例就是在钉「什么样的回答能过、什么样的必须被挡下」——
 * 挡不住的话，界面会拿着一段正文里并不存在的话去画标注，标到隔壁句子上。
 */

const DOC = [
  "---",
  "title: 元数据里的其实不该被挑",
  "---",
  "",
  "# 开篇",
  "",
  "其实这段正文写得有点啰嗦，然后可以再精炼一些。",
  "这句话的意思不太清楚，读者可能接不住。",
  "",
  "```js",
  "// 其实这是注释，不该被挑出来",
  "const a = 1;",
  "```",
].join("\n");

const reply = (items: unknown[], summary = "整体还行，个别句子可以再紧一紧。") =>
  JSON.stringify({ summary, items });

describe("extractJson", () => {
  it("干净的 JSON 直接认", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("裹了 ```json 代码块也认（没开 JSON 模式的家常这么回）", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("前面客气两句也认（按第一个 { 到最后一个 } 兜底）", () => {
    expect(extractJson('好的，这是结果：\n{"a":1}\n希望有帮助')).toEqual({ a: 1 });
  });

  it("压根不是 JSON 就返回 null，由调用方报错", () => {
    expect(extractJson("我没法完成这个请求")).toBeNull();
  });
});

describe("parseReviewResult：引文必须对得上", () => {
  it("逐字对得上的留下，行号按正文现找（不信模型给的那个）", () => {
    const out = parseReviewResult(
      reply([
        { category: "verbose", quote: "其实这段正文写得有点啰嗦", problem: "口水词", line: 99 },
      ]),
      DOC
    );
    expect(out.items).toHaveLength(1);
    expect(out.items[0].line).toBe(6);
    expect(DOC.split("\n")[6]).toContain(out.items[0].quote);
  });

  it("模型自己改写过的引文整条丢掉（正文里根本没这句）", () => {
    const out = parseReviewResult(
      reply([{ category: "verbose", quote: "这段正文其实写得啰嗦", problem: "口水词" }]),
      DOC
    );
    expect(out.items).toHaveLength(0);
  });

  it("frontmatter 与代码块里的行不收", () => {
    const out = parseReviewResult(
      reply([
        { category: "wording", quote: "元数据里的其实不该被挑", problem: "在 frontmatter 里" },
        { category: "wording", quote: "其实这是注释，不该被挑出来", problem: "在代码块里" },
      ]),
      DOC
    );
    expect(out.items).toHaveLength(0);
  });

  it("一条跑偏不连累其余（十条里挑得出九条就该给九条）", () => {
    const out = parseReviewResult(
      reply([
        { category: "verbose", quote: "根本不存在的一句话", problem: "对不上" },
        { category: "vague", quote: "这句话的意思不太清楚", problem: "没说透" },
      ]),
      DOC
    );
    expect(out.items).toHaveLength(1);
    expect(out.items[0].category).toBe("vague");
  });

  it("同一段引文说两遍只留第一遍", () => {
    const out = parseReviewResult(
      reply([
        { category: "vague", quote: "这句话的意思不太清楚", problem: "第一遍" },
        { category: "verbose", quote: "这句话的意思不太清楚", problem: "第二遍" },
      ]),
      DOC
    );
    expect(out.items).toHaveLength(1);
    expect(out.items[0].problem).toBe("第一遍");
  });

  it("太短的引文不收：一两个字在正文里到处都能撞上", () => {
    const out = parseReviewResult(reply([{ category: "wording", quote: "其实", problem: "太短" }]), DOC);
    expect(out.items).toHaveLength(0);
  });

  it("没说问题的不收：卡片上会空一块", () => {
    const out = parseReviewResult(
      reply([{ category: "vague", quote: "这句话的意思不太清楚", problem: "  " }]),
      DOC
    );
    expect(out.items).toHaveLength(0);
  });

  it("给再多也只留 12 条", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `第 ${i} 段有它自己的毛病要改。`);
    const doc = lines.join("\n");
    const out = parseReviewResult(
      reply(lines.map((l, i) => ({ category: "verbose", quote: l, problem: `第 ${i} 条` }))),
      doc
    );
    expect(out.items).toHaveLength(MAX_AI_ITEMS);
  });
});

describe("parseReviewResult：字段的洗法", () => {
  it("建议和原文一模一样就当没给：卡片上不该出现「采纳」", () => {
    const out = parseReviewResult(
      reply([
        {
          category: "vague",
          quote: "这句话的意思不太清楚",
          problem: "没说透",
          suggestion: "这句话的意思不太清楚",
        },
      ]),
      DOC
    );
    expect(out.items[0].suggestion).toBeUndefined();
  });

  it("认不出的分类落到「用词」，不整条丢", () => {
    const out = parseReviewResult(
      reply([{ category: "胡编的一类", quote: "这句话的意思不太清楚", problem: "x" }]),
      DOC
    );
    expect(out.items[0].category).toBe("wording");
  });

  it("模型拿中文标签当 id 回来也认", () => {
    const out = parseReviewResult(
      reply([{ category: "表述不清", quote: "这句话的意思不太清楚", problem: "x" }]),
      DOC
    );
    expect(out.items[0].category).toBe("vague");
  });

  it("只返回真正用到的分类：工具条上不该出现「0 条」的筹码", () => {
    const out = parseReviewResult(
      reply([{ category: "vague", quote: "这句话的意思不太清楚", problem: "x" }]),
      DOC
    );
    expect(out.categories.map((c) => c.id)).toEqual(["vague"]);
  });

  it("每条意见的 id 都不重样（界面拿它当 React key）", () => {
    const out = parseReviewResult(
      reply([
        { category: "verbose", quote: "其实这段正文写得有点啰嗦", problem: "a" },
        { category: "vague", quote: "这句话的意思不太清楚", problem: "b" },
      ]),
      DOC
    );
    expect(new Set(out.items.map((i) => i.id)).size).toBe(2);
  });

  it("没给总评就自己补一句，别让卡片栏顶上空着", () => {
    const out = parseReviewResult(
      JSON.stringify({ items: [{ category: "vague", quote: "这句话的意思不太清楚", problem: "x" }] }),
      DOC
    );
    expect(out.summary).not.toBe("");
  });

  it("回答里没有 JSON 就抛错（界面据此提示换个模型）", () => {
    expect(() => parseReviewResult("抱歉，我无法完成", DOC)).toThrow(/没有按格式/);
  });

  it("items 不是数组也不炸，只是一条都没有", () => {
    expect(parseReviewResult(JSON.stringify({ summary: "还行", items: "一堆" }), DOC).items).toEqual(
      []
    );
  });
});

describe("提示词", () => {
  it("每一类的系统提示都把自己那几个分类点了名，模型才知道能选哪些", () => {
    for (const k of REVIEW_KINDS) {
      const prompt = reviewSystemPrompt(k.id);
      for (const c of reviewCategories(k.id)) expect(prompt, k.id).toContain(c.id);
    }
  });

  it("用户提示带行号，且行号与正文一一对应", () => {
    const prompt = buildReviewUserPrompt("第一行\n第二行");
    expect(prompt).toContain("0\t第一行");
    expect(prompt).toContain("1\t第二行");
  });

  it("超长正文截断在换行处，不把一句话劈两半", () => {
    const doc = Array.from({ length: 200 }, (_, i) => `第 ${i} 行写了一句不长不短的话。`).join("\n");
    const cut = clipForReview(doc, 500);
    expect(cut.length).toBeLessThanOrEqual(500);
    expect(doc.startsWith(cut)).toBe(true);
    expect(cut.endsWith("。")).toBe(true);
  });

  it("不超长就原样送过去", () => {
    expect(clipForReview("短文", 500)).toBe("短文");
  });
});

/**
 * 审核分两类：看表述的和看公众号规则的。
 * 这一组钉的是「两类不许串」——串了的话，合规审核会给出一栏「这句啰嗦」，
 * 而筛选筹码上挂着的却是「诱导行为」，用户完全不知道自己刚才审的是什么。
 */
describe("审核类型", () => {
  it("就这两类，id 不重样，名字和一句话说明都得有", () => {
    expect(REVIEW_KINDS.map((k) => k.id)).toEqual(["expression", "wechat_rules"]);
    for (const k of REVIEW_KINDS) {
      expect(k.label.length, k.id).toBeGreaterThan(0);
      expect(k.description.length, k.id).toBeGreaterThan(8);
    }
  });

  it("认不出的类型一律不认（接口据此回 400，不能悄悄换一类审）", () => {
    for (const k of REVIEW_KINDS) expect(isReviewKind(k.id), k.id).toBe(true);
    expect(isReviewKind("胡编的")).toBe(false);
    expect(isReviewKind(undefined)).toBe(false);
    expect(isReviewKind(1)).toBe(false);
  });

  it("没选过就审表述：点「审核」的人多半是想让人挑毛病", () => {
    expect(DEFAULT_REVIEW_KIND).toBe("expression");
  });

  it("界面拿得到名字，认不出的落回默认那一类", () => {
    expect(reviewKindLabel("wechat_rules")).toBe("公众号合规审核");
    expect(reviewKindLabel("胡编的")).toBe(reviewKindLabel(DEFAULT_REVIEW_KIND));
  });

  it("两类的分类清单各管各的，一个 id 都不重叠", () => {
    const expression = reviewCategories("expression").map((c) => c.id);
    const wechat = reviewCategories("wechat_rules").map((c) => c.id);
    expect(expression.some((id) => wechat.includes(id))).toBe(false);
  });

  it("每个分类都有名字和十六进制色值（正文里的标注按它上色）", () => {
    for (const k of REVIEW_KINDS) {
      const cats = reviewCategories(k.id);
      expect(cats.length, k.id).toBeGreaterThan(0);
      expect(new Set(cats.map((c) => c.id)).size, k.id).toBe(cats.length);
      for (const c of cats) {
        expect(c.label, c.id).not.toBe("");
        expect(c.color, c.id).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe("parseReviewResult：分类按这一趟审的是哪一类来认", () => {
  it("合规审核认自己那几个 id", () => {
    const out = parseReviewResult(
      reply([{ category: "inducement", quote: "这句话的意思不太清楚", problem: "诱导关注" }]),
      DOC,
      "wechat_rules"
    );
    expect(out.items[0].category).toBe("inducement");
    expect(out.categories.map((c) => c.id)).toEqual(["inducement"]);
  });

  it("合规审核收到表述那套的 id，落到兜底分类而不是整条丢", () => {
    const out = parseReviewResult(
      reply([{ category: "verbose", quote: "这句话的意思不太清楚", problem: "串类了" }]),
      DOC,
      "wechat_rules"
    );
    expect(out.items).toHaveLength(1);
    expect(reviewCategories("wechat_rules").map((c) => c.id)).toContain(out.items[0].category);
  });

  it("合规审核拿中文标签当 id 回来也认", () => {
    const out = parseReviewResult(
      reply([{ category: "绝对化用语", quote: "这句话的意思不太清楚", problem: "最、第一" }]),
      DOC,
      "wechat_rules"
    );
    expect(out.items[0].category).toBe("absolute");
  });

  it("不给类型就按表述审核办（老版本网页发来的请求）", () => {
    const out = parseReviewResult(
      reply([{ category: "verbose", quote: "这句话的意思不太清楚", problem: "啰嗦" }]),
      DOC
    );
    expect(out.items[0].category).toBe("verbose");
  });

  it("引文那套硬规矩跟审哪一类无关：对不上照样丢，超过 12 条照样截", () => {
    const dropped = parseReviewResult(
      reply([{ category: "sensitive", quote: "正文里根本没有这句话", problem: "对不上" }]),
      DOC,
      "wechat_rules"
    );
    expect(dropped.items).toHaveLength(0);

    const lines = Array.from({ length: 30 }, (_, i) => `第 ${i} 段有它自己的合规风险要看。`);
    const many = parseReviewResult(
      reply(lines.map((l, i) => ({ category: "sensitive", quote: l, problem: `第 ${i} 条` }))),
      lines.join("\n"),
      "wechat_rules"
    );
    expect(many.items).toHaveLength(MAX_AI_ITEMS);
  });

  it("合规审核这类多半没有改法，没给 suggestion 也照收（卡片只出「知道了 / 忽略」）", () => {
    const out = parseReviewResult(
      reply([{ category: "clickbait", quote: "这句话的意思不太清楚", problem: "标题与正文不符" }]),
      DOC,
      "wechat_rules"
    );
    expect(out.items[0].suggestion).toBeUndefined();
  });
});
