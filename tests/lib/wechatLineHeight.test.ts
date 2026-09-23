// @vitest-environment jsdom
// 公众号「内容结构检测」的行高误报与根 section 丢失：
// 1. 检测器用 Range.getClientRects() 数行，行内元素（strong/span/br…）把一行拆成多个矩形，
//    带直接文本的混排段落会被误报「行高小于字体大小」。它不查没有直接文本的块，
//    所以我们把混排块里的裸文本包进无属性的 span；纯文本段落和代码块不能被波及。
// 2. Chrome 选区复制会丢掉最外层 <section> 和它的内联样式，顶层块得自己带上字号/行高等。

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

/** 直接挂在元素下、且不是纯空白的文本节点 */
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
    // 包裹用的 span 是裸的：不带样式、不带 class，公众号不会动它
    for (const s of spans) {
      expect(s.hasAttribute("style")).toBe(false);
      expect(s.hasAttribute("class")).toBe(false);
    }
    // 拼回来的文字与原文一致
    expect(children.map((c) => c.textContent).join("")).toBe(text);
  });

  it("纯文本段落原样保留，不多包一层", async () => {
    const doc = await build("我从来没考虑过用 DeepSeek V4 Pro。");
    const p = doc.querySelector("p")!;
    expect(p.childNodes).toHaveLength(1);
    expect(p.firstChild!.nodeType).toBe(Node.TEXT_NODE);
    expect(p.querySelector("span")).toBeNull();
  });

  it("代码块内部不受影响：仍是 文本 + <br> 的直接子节点", async () => {
    const doc = await build("```\na b\n  c\n```");
    const code = doc.querySelector("pre > code")!;
    expect(code).not.toBeNull();
    expect(doc.querySelector("pre")!.querySelector("span")).toBeNull();
    const kinds = Array.from(code.childNodes).map((n) =>
      n.nodeType === Node.TEXT_NODE ? "text" : (n as Element).tagName
    );
    expect(kinds).toEqual(["text", "BR", "text"]);
    expect(code.textContent).toBe("a b  c");
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

    // 标题已有自己的行高（基础样式 1.45），不能被根的值覆盖
    const h2 = root.querySelector(":scope > h2") as HTMLElement;
    expect(h2.style.getPropertyValue("line-height")).toBe("1.45");
    expect(h2.style.getPropertyValue("line-height")).not.toBe(rootLineHeight);
  });
});
