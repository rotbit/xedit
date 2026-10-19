// @vitest-environment jsdom
// WeChat 「内容结构检测」 (content structure check) false line-height warnings and the lost root section:
// 1. The checker counts lines with Range.getClientRects(); inline elements (strong/span/br…) split one line into several rects,
//    so mixed paragraphs with direct text get flagged as "line height smaller than font size". It skips blocks without direct text,
//    so we wrap bare text in mixed blocks in attribute-less spans; plain-text paragraphs and code blocks must not be affected.
// 2. Chrome's selection copy drops the outermost <section> and its inline styles, so top-level blocks must carry font size/line height etc. themselves.

import { describe, expect, it } from "vitest";
import { buildWechatHtml } from "@/lib/copy/wechat";
import { resolveTheme } from "@/lib/themes";

const build = async (markdown: string) => {
  const html = await buildWechatHtml(markdown, {
    themeCss: resolveTheme("classic", []).css,
    codeCss: "",
  });
  return new DOMParser().parseFromString(html, "text/html");
};

/** Text nodes directly under the element that aren't pure whitespace */
const directTexts = (el: Element) =>
  Array.from(el.childNodes).filter(
    (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0
  );

describe("公众号行高误报：混排段落的裸文本包进 span", () => {
  it("文字 + 加粗的段落不再有直接文本子节点", async () => {
    const text = "这个场景，估计不少圈友都用得上——大A交易复盘。";
    const doc = await build("这个场景，估计不少圈友都用得上——**大A交易复盘**。");
    const p = doc.querySelector("p")!;
    expect(p).not.toBeNull();
    expect(directTexts(p)).toHaveLength(0);

    const children = Array.from(p.children);
    expect(children.some((c) => c.tagName === "STRONG")).toBe(true);
    const spans = children.filter((c) => c.tagName === "SPAN");
    expect(spans.length).toBe(2);
    // The wrapping span is bare: no style, no class, so WeChat leaves it alone
    for (const s of spans) {
      expect(s.hasAttribute("style")).toBe(false);
      expect(s.hasAttribute("class")).toBe(false);
    }
    // The reassembled text matches the original
    expect(children.map((c) => c.textContent).join("")).toBe(text);
  });

  it("纯文本段落原样保留，不多包一层", async () => {
    const doc = await build("我从来没考虑过用 DeepSeek V4 Pro。");
    const p = doc.querySelector("p")!;
    expect(p.childNodes).toHaveLength(1);
    expect(p.firstChild!.nodeType).toBe(Node.TEXT_NODE);
    expect(p.querySelector("span")).toBeNull();
  });

  it("多行代码块：code 里的裸文本也包进裸 span，空白一个不少", async () => {
    const doc = await build("```\na b\n  c\n```");
    const code = doc.querySelector("pre > code")!;
    expect(code).not.toBeNull();
    expect(directTexts(code)).toHaveLength(0);
    const kinds = Array.from(code.childNodes).map((n) =>
      n.nodeType === Node.TEXT_NODE ? "text" : (n as Element).tagName
    );
    expect(kinds).toEqual(["SPAN", "BR", "SPAN"]);
    for (const s of Array.from(code.children).filter((c) => c.tagName === "SPAN")) {
      expect(s.hasAttribute("style")).toBe(false);
    }
    expect(code.textContent).toBe("a\u00a0b\u00a0\u00a0c");
    // code's own inline styles (font size, monospace font) are kept as-is
    expect((code as HTMLElement).style.getPropertyValue("font-family")).toContain("Menlo");
  });

  it("单行代码块没有混排，不多包一层", async () => {
    const doc = await build("```\nabc\n```");
    const code = doc.querySelector("pre > code")!;
    expect(code.childNodes).toHaveLength(1);
    expect(code.firstChild!.nodeType).toBe(Node.TEXT_NODE);
  });
});

describe("根 section 的排版样式抄到顶层块", () => {
  it("顶层段落带上根的行高与字号，标题保留自己的行高", async () => {
    const doc = await build("普通段落\n\n## 标题");
    const root = doc.body.firstElementChild as HTMLElement;
    expect(root.tagName).toBe("SECTION");
    const rootLineHeight = root.style.getPropertyValue("line-height");
    const rootFontSize = root.style.getPropertyValue("font-size");
    expect(rootLineHeight).not.toBe("");
    expect(rootFontSize).not.toBe("");

    const p = root.querySelector(":scope > p") as HTMLElement;
    expect(p.style.getPropertyValue("line-height")).toBe(rootLineHeight);
    expect(p.style.getPropertyValue("font-size")).toBe(rootFontSize);

    // Headings already have their own line height (base style 1.45) and must not be overridden by the root value
    const h2 = root.querySelector(":scope > h2") as HTMLElement;
    expect(h2.style.getPropertyValue("line-height")).toBe("1.45");
    expect(h2.style.getPropertyValue("line-height")).not.toBe(rootLineHeight);
  });
});
