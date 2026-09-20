import { describe, expect, it } from "vitest";

import {
  AI_CATEGORIES,
  buildReviewUserPrompt,
  clipForReview,
  extractJson,
  MAX_AI_ITEMS,
  parseReviewResult,
  REVIEW_SYSTEM_PROMPT,
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
  it("系统提示里把六类都点了名，模型才知道能选哪些", () => {
    for (const c of AI_CATEGORIES) expect(REVIEW_SYSTEM_PROMPT).toContain(c.id);
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
