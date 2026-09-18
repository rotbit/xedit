/**
 * data-line 与同步滚动的纯函数层。
 * 没有 DOM，所以只测两样能脱离 DOM 的东西：渲染出来的行号、锚点表上的插值。
 */
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { lineForTop, topForLine, type Anchor } from "@/hooks/useSyncScroll";

/** 找出包住这段文字的那个 data-line（0 基，与编辑器行号同口径） */
function lineOfText(html: string, text: string): number {
  const parts = html.split(/data-line="(\d+)"/);
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i + 1].includes(text)) return Number(parts[i]);
  }
  return -1;
}

describe("frontmatter 的行号偏移", () => {
  const src = [
    "---", // 0
    "title: 秋天的观察", // 1
    "---", // 2
    "", // 3
    "第一段落在这里。", // 4
    "", // 5
    "## 小标题", // 6
    "", // 7
    "```js", // 8
    "const a = 1;", // 9
    "```", // 10
  ].join("\n");

  it("data-line 就是原文里的行号，不再少掉 frontmatter 那几行", () => {
    const html = renderMarkdown(src);
    expect(lineOfText(html, "第一段落在这里。")).toBe(4);
    expect(lineOfText(html, "小标题")).toBe(6);
    expect(lineOfText(html, "const")).toBe(8);
  });

  it("没有 frontmatter 时一切照旧", () => {
    const html = renderMarkdown("第一段落在这里。\n\n## 小标题\n");
    expect(lineOfText(html, "第一段落在这里。")).toBe(0);
    expect(lineOfText(html, "小标题")).toBe(2);
  });

  it("多余空行补出来的空段落也跟着偏移", () => {
    // 0:--- 1:a: 1 2:--- 3:空 4:正文 5:空 6:空 7:尾段
    const html = renderMarkdown("---\na: 1\n---\n\n正文\n\n\n尾段\n");
    expect(lineOfText(html, "<br>")).toBe(3);
    expect(lineOfText(html, "尾段")).toBe(7);
  });
});

describe("预览锚点插值", () => {
  const anchors: Anchor[] = [
    { line: 0, top: 0 },
    { line: 10, top: 200 },
    { line: 20, top: 600 },
  ];

  it("行 → 纵坐标：两锚点之间按比例走", () => {
    expect(topForLine(anchors, 0)).toBe(0);
    expect(topForLine(anchors, 5)).toBe(100);
    expect(topForLine(anchors, 15)).toBe(400);
    expect(topForLine(anchors, 10)).toBe(200);
  });

  it("行 → 纵坐标：超出末尾停在最后一个锚点", () => {
    expect(topForLine(anchors, 99)).toBe(600);
  });

  it("纵坐标 → 行：与正向互逆", () => {
    expect(lineForTop(anchors, 100)).toBe(5);
    expect(lineForTop(anchors, 400)).toBe(15);
    expect(lineForTop(anchors, 5000)).toBe(20);
  });

  it("空锚点表不炸", () => {
    expect(topForLine([], 3)).toBe(0);
    expect(lineForTop([], 300)).toBe(0);
  });

  it("同一行上的重复锚点不会除零", () => {
    const flat: Anchor[] = [
      { line: 4, top: 120 },
      { line: 4, top: 120 },
    ];
    expect(topForLine(flat, 4.5)).toBe(120);
    expect(lineForTop(flat, 130)).toBe(4);
  });
});
