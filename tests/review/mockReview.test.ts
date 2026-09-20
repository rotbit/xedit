import { describe, expect, it, vi } from "vitest";

import {
  buildReview,
  ERROR_MARK,
  MOCK_DELAY_MS,
  mockReview,
} from "@/features/review/mockReview";

/**
 * 假数据也有硬约束：意见是靠「引文文字」对位的（见 locate.ts），
 * 所以每条 quote 都必须是它声称那一行里逐字存在的片段，
 * 而且不能取自 frontmatter、代码块、图片/链接的网址——那些地方要么不是正文，
 * 要么渲染后长得不一样，标注会画歪。
 *
 * 还有一条是这回返工补上的：规则挑不出毛病的干净稿子，也得给得出一栏意见。
 * 之前拿一篇两万多字的正经稿子试，工具条上写着「0 条建议」，整个原型无话可说。
 */

/** 每条意见都能在它声称的那一行里逐字找到 */
function expectQuotesVerbatim(content: string, items: { quote: string; line: number }[]) {
  const lines = content.split("\n");
  for (const it of items) {
    expect(lines[it.line], `第 ${it.line} 行`).toContain(it.quote);
  }
}

const MIXED = [
  "---",
  "title: 其实这只是元数据，然后不该被挑毛病",
  "cover: https://example.com/cover.png",
  "---",
  "",
  "# 开篇",
  "",
  "其实这段正文里有口水词，然后应该被挑出来说一说。",
  "",
  "```js",
  "// 其实这是代码，然后也不该被挑出来",
  "const veryVerbose = 1;",
  "```",
  "",
  "![其实是图片](https://example.com/a.png)",
  "",
  "去看[其实是链接](https://example.com/x)就知道了，然后别把网址挑出来。",
].join("\n");

/** 一篇干净的散文：没有口水词、没有叠字叠标点、也没有超长句，规则一条都挑不中 */
const PROSE = [
  "# 秋日随笔",
  "",
  "窗外的梧桐叶子落了一地，扫地的人把它们堆在墙角。",
  "清晨的风带着凉意，吹过长街时会卷起几片碎叶。",
  "我在书桌前坐了很久，把去年写下的句子逐行读了一遍。",
  "有些段落读起来还算顺畅，有些则显得拖沓。",
  "写字这件事需要耐心，也需要在合适的时候停下来。",
  "到了傍晚，天色暗得很快，屋子里只剩下台灯的光。",
  "我合上本子，决定明天再继续修改剩下的章节。",
  "这一年过得比想象中要快一些。",
  "明天还要接着把剩下的章节读完。",
].join("\n");

describe("buildReview：引文的来路", () => {
  const result = buildReview(MIXED);

  it("每条引文都逐字取自它声称的那一行", () => {
    expect(result.items.length).toBeGreaterThan(0);
    expectQuotesVerbatim(MIXED, result.items);
  });

  it("不碰 frontmatter、代码块、图片与链接的网址", () => {
    const lines = MIXED.split("\n");
    for (const it of result.items) {
      expect(it.line).toBeGreaterThan(3); // frontmatter 占前四行
      expect(lines[it.line].startsWith("```")).toBe(false);
      expect(it.quote).not.toContain("元数据");
      expect(it.quote).not.toContain("const");
      expect(it.quote).not.toContain("http");
      expect(it.quote).not.toContain("图片");
      expect(it.quote).not.toContain("链接");
    }
  });

  it("同一份正文永远给同一批意见（纯函数，不掷骰子）", () => {
    expect(buildReview(MIXED)).toEqual(buildReview(MIXED));
  });

  it("结果自带分类，每条意见的 category 都在其中", () => {
    const ids = new Set(result.categories.map((c) => c.id));
    for (const it of result.items) expect(ids.has(it.category)).toBe(true);
  });
});

describe("buildReview：条数", () => {
  it("毛病再多也只给 12 条（再多作者也看不过来）", () => {
    const wordy = Array.from(
      { length: 24 },
      (_, i) => `其实第 ${i} 段基本上都是废话，然后可以说没什么信息量。`
    ).join("\n\n");
    const items = buildReview(wordy).items;
    expect(items.length).toBe(12);
    expectQuotesVerbatim(wordy, items);
  });

  it("一条口水词都没有的干净稿子，也给得出一栏意见（曾经在这里出过「0 条建议」）", () => {
    const items = buildReview(PROSE).items;
    expect(items.length).toBeGreaterThanOrEqual(6);
    expectQuotesVerbatim(PROSE, items);
  });

  it("兜底意见摊在全篇，不挤在开头", () => {
    const items = buildReview(PROSE).items;
    const lines = new Set(items.map((it) => it.line));
    expect(lines.size).toBeGreaterThanOrEqual(6);
  });

  it("兜底意见里既有能一键采纳的，也有只提意见的（两种卡片都得跑到）", () => {
    const items = buildReview(PROSE).items;
    expect(items.some((it) => it.suggestion)).toBe(true);
    expect(items.some((it) => !it.suggestion)).toBe(true);
  });

  it("采纳后的建议确实不同于原文，否则这条意见没有意义", () => {
    for (const it of buildReview(PROSE).items) {
      if (it.suggestion) expect(it.suggestion).not.toBe(it.quote);
    }
  });

  it("空正文不炸，也不硬凑意见", () => {
    const result = buildReview("");
    expect(result.items).toEqual([]);
    expect(result.summary).toContain("没扫到明显要改的地方");
  });
});

describe("mockReview：界面用的那层", () => {
  it("等满延迟才给结果（加载态得真的看得见）", async () => {
    vi.useFakeTimers();
    try {
      const pending = mockReview(PROSE);
      let done = false;
      void pending.then(() => {
        done = true;
      });
      await vi.advanceTimersByTimeAsync(MOCK_DELAY_MS - 1);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual(buildReview(PROSE));
    } finally {
      vi.useRealTimers();
    }
  });

  it("正文里写了出错标记就当审核失败（原型里看「出错」态的唯一入口）", async () => {
    vi.useFakeTimers();
    try {
      const pending = mockReview(`${PROSE}\n\n${ERROR_MARK}`);
      const caught = pending.catch((e: Error) => e.message);
      await vi.advanceTimersByTimeAsync(MOCK_DELAY_MS);
      await expect(caught).resolves.toContain("审核服务没有响应");
    } finally {
      vi.useRealTimers();
    }
  });
});
