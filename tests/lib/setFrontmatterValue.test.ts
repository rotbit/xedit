import { describe, expect, it } from "vitest";
import { parseFrontmatter, setFrontmatterValue } from "@/lib/frontmatter";

describe("setFrontmatterValue", () => {
  it("没有 frontmatter 时在文首新建", () => {
    const next = setFrontmatterValue("# 标题\n正文", "cover", "https://a.com/x.png");
    expect(next).toBe("---\ncover: https://a.com/x.png\n---\n\n# 标题\n正文");
    expect(parseFrontmatter(next)?.data.cover).toBe("https://a.com/x.png");
  });

  it("已有 frontmatter：追加、替换都不动别的行", () => {
    const md = "---\ntitle: 你好\ntags:\n  - a\n  - b\n---\n正文";
    const added = setFrontmatterValue(md, "cover", "attachments/1.png");
    expect(added).toBe("---\ntitle: 你好\ntags:\n  - a\n  - b\ncover: attachments/1.png\n---\n正文");
    const replaced = setFrontmatterValue(added, "cover", "attachments/2.png");
    expect(parseFrontmatter(replaced)?.data).toEqual({ title: "你好", tags: ["a", "b"], cover: "attachments/2.png" });
  });

  it("删除：只剩这一个键时整块 frontmatter 一起拿掉，回到原文", () => {
    const md = "# 标题\n正文";
    expect(setFrontmatterValue(setFrontmatterValue(md, "cover", "x.png"), "cover", null)).toBe(md);
    expect(setFrontmatterValue("---\ntitle: a\ncover: x.png\n---\n正文", "cover", null)).toBe("---\ntitle: a\n---\n正文");
    expect(setFrontmatterValue(md, "cover", null)).toBe(md);
  });

  it("原来是列表写法的键，连同名下的条目一起换掉", () => {
    const next = setFrontmatterValue("---\ncover:\n  - a.png\n  - b.png\nauthor: 我\n---\n正文", "cover", "c.png");
    expect(next).toBe("---\ncover: c.png\nauthor: 我\n---\n正文");
  });
});
