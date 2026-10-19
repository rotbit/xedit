import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown/renderer";

const blanks = (html: string) => html.split("<br></p>").length - 1;

describe("frontmatter 之后的空行", () => {
  it("紧跟 frontmatter 的一个空行只是分隔，不输出空段", () => {
    const html = renderMarkdown("---\ncover: https://x.com/c.webp\n---\n\n正文");
    expect(blanks(html)).toBe(0);
    expect(html).toContain("正文");
  });

  it("第二个起的空行照旧保留为留白，行号带上 frontmatter 的偏移", () => {
    const html = renderMarkdown("---\ncover: a\n---\n\n\n正文");
    expect(blanks(html)).toBe(1);
    // frontmatter takes 3 lines (0-2), line 3 is the separator, and line 4 is the blank space
    expect(html).toContain('<p data-line="4"><br></p>');
  });

  it("没有 frontmatter 时，文首空行仍每行算留白", () => {
    expect(blanks(renderMarkdown("\n\n正文"))).toBe(2);
  });
});
