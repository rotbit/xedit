// 导出 Word · 行内转换：行内 DOM 节点（文本、加粗/斜体/删除线、链接、图片、公式、SPAN 字体颜色等）→ TextRun / ImageRun / 超链接。

/**
 * 导出 Word 的行内层：把渲染好的 HTML 里的行内节点翻译成 docx 的 TextRun / ImageRun / 超链接。
 * 输入就是预览用的那棵 DOM，所以这里认的是渲染产物的类名（math、prefix/suffix、footnote-backref…）——
 * 改 Markdown 渲染的输出结构时，这个文件的分支要跟着核对一遍。
 * 图片和公式的位图由上层预先备好塞进 Build（b.images / b.math），本文件只取用，不发任何请求。
 */
import { ExternalHyperlink, ImageRun, ShadingType, TextRun } from "docx";
import { CONTENT_W, GRAY, LINK_BLUE, MONO_FONT } from "./types";
import type { Build, InlineChild, PreparedImage, RunStyle } from "./types";

// —— 行内节点 → TextRun / ImageRun / 超链接 ——

/** 内联 style 的 CSS 颜色 → docx 十六进制（不带 #）；认不出的形态返回 undefined。
 *  浏览器会把 style 属性里的 hex 规范化成 rgb() 形态，两种都要接 */
function cssColorToHex(css: string): string | undefined {
  const rgb = css.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) {
    return rgb
      .slice(1, 4)
      .map((v) => Number(v).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }
  const hex = css.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return undefined;
  const h = hex[1];
  return (h.length === 3 ? [...h].map((c) => c + c).join("") : h).toUpperCase();
}

/** 造一个文本 run。行内代码要同时换等宽字体、底纹和字号，所以 code 分支在三处各出现一次。 */
function makeRun(text: string, st: RunStyle): TextRun {
  return new TextRun({
    text,
    bold: st.bold,
    italics: st.italics,
    strike: st.strike,
    underline: st.underline ? {} : undefined,
    superScript: st.sup,
    subScript: st.sub,
    color: st.color,
    size: st.code ? (st.size ?? 20) : st.size,
    font: st.code ? MONO_FONT : undefined,
    shading: st.code ? { type: ShadingType.CLEAR, fill: "F2F3F5" } : undefined,
  });
}

/** 等比缩到正文宽度内。只缩不放——小图放大在 Word 里会糊成一片。 */
function fit(pi: PreparedImage, maxW: number): { width: number; height: number } {
  const scale = Math.min(1, maxW / pi.width);
  return { width: Math.round(pi.width * scale), height: Math.round(pi.height * scale) };
}

/** 把预备好的位图包成 ImageRun，宽度默认压到正文宽。 */
export function imageRun(pi: PreparedImage, maxW = CONTENT_W): ImageRun {
  return new ImageRun({ type: pi.type, data: pi.data, transformation: fit(pi, maxW) });
}

/** Word 放不了视频，退化成一个指向源地址的超链接。 */
export function videoLink(src: string): ExternalHyperlink {
  return new ExternalHyperlink({
    link: src,
    children: [new TextRun({ text: "▶ 点击观看视频", bold: true, color: LINK_BLUE, underline: {} })],
  });
}

/** 公式优先用预渲染的位图；没备到（例如取图失败）就退回斜体的 TeX 原文，至少不丢信息。 */
export function mathImage(el: Element, st: RunStyle, b: Build): InlineChild {
  const pi = b.math.get(el);
  if (pi) return imageRun(pi);
  const tex = el.getAttribute("data-tex") ?? el.textContent ?? "";
  return makeRun(tex, { ...st, italics: true });
}

/** 递归展开一个行内节点，结果推进 out。st 是从祖先继承下来的样式，逐层叠加而不是每层重算。 */
export function pushInline(node: Node, st: RunStyle, out: InlineChild[], b: Build): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").replace(/\n/g, " ");
    if (text) out.push(makeRun(text, st));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toUpperCase();

  if (tag === "SVG") return; // 裸 SVG 只在公式里出现，公式已整体转图
  if (el.classList.contains("math")) {
    out.push(mathImage(el, st, b));
    return;
  }
  if (el.classList.contains("prefix") || el.classList.contains("suffix")) return; // 标题装饰
  if (el.classList.contains("footnote-backref")) return; // 文内锚点在 Word 里无意义

  switch (tag) {
    case "BR":
      out.push(new TextRun({ text: "", break: 1 }));
      return;
    case "STRONG":
    case "B":
      return recurse({ ...st, bold: true });
    case "EM":
    case "I":
      return recurse({ ...st, italics: true });
    case "DEL":
    case "S":
    case "STRIKE":
      return recurse({ ...st, strike: true });
    case "U":
    case "INS":
      return recurse({ ...st, underline: true });
    case "CODE":
      return recurse({ ...st, code: true });
    case "SUP":
      return recurse({ ...st, sup: true });
    case "SUB":
      return recurse({ ...st, sub: true });
    case "A": {
      const href = el.getAttribute("href") ?? "";
      if (!href || href.startsWith("#")) return recurse(st); // 文内锚点降级为纯文本
      const kids: InlineChild[] = [];
      el.childNodes.forEach((n) => pushInline(n, { ...st, color: LINK_BLUE, underline: true }, kids, b));
      if (kids.length) out.push(new ExternalHyperlink({ link: href, children: kids }));
      return;
    }
    case "IMG": {
      const src = el.getAttribute("src") ?? "";
      const pi = src ? b.images.get(src) : null;
      if (pi) out.push(imageRun(pi));
      else {
        const alt = el.getAttribute("alt");
        out.push(makeRun(`[图片${alt ? `：${alt}` : ""}]`, { ...st, color: GRAY }));
      }
      return;
    }
    case "VIDEO": {
      const src = el.getAttribute("src");
      if (src) out.push(videoLink(src));
      return;
    }
    case "INPUT": {
      // 任务列表复选框
      if (el.getAttribute("type") === "checkbox") {
        out.push(makeRun(el.hasAttribute("checked") ? "☑ " : "☐ ", st));
      }
      return;
    }
    case "SPAN": {
      // 编辑器字体颜色（<span style="color:…">）落进 Word 字色
      const c = (el as HTMLElement).style?.color;
      const hex = c ? cssColorToHex(c) : undefined;
      return recurse(hex ? { ...st, color: hex } : st);
    }
    default:
      return recurse(st);
  }

  // 声明放在 switch 之后、靠函数提升供上面各分支使用，这样每个分支只需要一行 return recurse(...)
  function recurse(next: RunStyle): void {
    el.childNodes.forEach((n) => pushInline(n, next, out, b));
  }
}

/** 取一个元素的全部行内内容。上层的段落、表格单元格都从这里拿 children。 */
export function inlineOf(el: Element, b: Build, st: RunStyle = {}): InlineChild[] {
  const out: InlineChild[] = [];
  el.childNodes.forEach((n) => pushInline(n, st, out, b));
  return out;
}
