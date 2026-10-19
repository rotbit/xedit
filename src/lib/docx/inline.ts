// Word export · inline conversion: inline DOM nodes (text, bold/italic/strikethrough, links, images, formulas, SPAN font colors, etc.) → TextRun / ImageRun / hyperlinks.

/**
 * Inline layer of Word export: translates inline nodes in the rendered HTML into docx TextRun / ImageRun / hyperlinks.
 * The input is the same DOM used for preview, so this matches class names from the rendered output (math, prefix/suffix, footnote-backref…);
 * when changing the Markdown renderer's output structure, recheck the branches in this file.
 * Image and formula bitmaps are prepared upstream and put into Build (b.images / b.math); this file only reads them and makes no requests.
 */
import { ExternalHyperlink, ImageRun, ShadingType, TextRun } from "docx";
import { CONTENT_W, GRAY, LINK_BLUE, MONO_FONT } from "./types";
import type { Build, InlineChild, PreparedImage, RunStyle } from "./types";

// -- Inline nodes → TextRun / ImageRun / hyperlinks --

/** CSS color from inline style → docx hex (without #); unrecognized forms return undefined.
 *  Browsers normalize hex in the style attribute to rgb(), so both must be handled */
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

/** Build a text run. Inline code needs a monospace font, shading, and font size together, so the code branch appears in three places. */
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

/** Scale proportionally to fit the body width. Only shrinks, never enlarges: upscaled small images look blurry in Word. */
function fit(pi: PreparedImage, maxW: number): { width: number; height: number } {
  const scale = Math.min(1, maxW / pi.width);
  return { width: Math.round(pi.width * scale), height: Math.round(pi.height * scale) };
}

let imageSeq = 0;

/** Wrap a prepared bitmap in an ImageRun, defaulting to body width.
 *  docPr/cNvPr name and descr are never left empty: Word doesn't care, but some importers (Feishu, WPS, Tiptap, etc.)
 *  use these attributes to identify images and read alt text, and empty strings risk being treated as invalid images there. */
export function imageRun(pi: PreparedImage, maxW = CONTENT_W, alt = ""): ImageRun {
  imageSeq += 1;
  const name = `image${imageSeq}`;
  return new ImageRun({
    type: pi.type,
    data: pi.data,
    transformation: fit(pi, maxW),
    altText: { name, description: alt || name, title: alt || name },
  });
}

/** Word can't hold videos, so fall back to a hyperlink to the source URL. */
export function videoLink(src: string): ExternalHyperlink {
  return new ExternalHyperlink({
    link: src,
    children: [new TextRun({ text: "▶ 点击观看视频", bold: true, color: LINK_BLUE, underline: {} })], // i18n-ignore part of the exported/copied content format; stays Chinese for now
  });
}

/** Formulas prefer the pre-rendered bitmap; if unavailable (e.g. fetching failed), fall back to italic TeX source so no information is lost. */
export function mathImage(el: Element, st: RunStyle, b: Build): InlineChild {
  const pi = b.math.get(el);
  if (pi) return imageRun(pi);
  const tex = el.getAttribute("data-tex") ?? el.textContent ?? "";
  return makeRun(tex, { ...st, italics: true });
}

/** Recursively expand an inline node, pushing results into out. st is the style inherited from ancestors, layered per level instead of recomputed each time. */
export function pushInline(node: Node, st: RunStyle, out: InlineChild[], b: Build): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").replace(/\n/g, " ");
    if (text) out.push(makeRun(text, st));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toUpperCase();

  if (tag === "SVG") return; // Bare SVG only appears in formulas, which are already converted to images whole
  if (el.classList.contains("math")) {
    out.push(mathImage(el, st, b));
    return;
  }
  if (el.classList.contains("prefix") || el.classList.contains("suffix")) return; // Heading decoration
  if (el.classList.contains("footnote-backref")) return; // In-document anchors are meaningless in Word

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
      if (!href || href.startsWith("#")) return recurse(st); // In-document anchors degrade to plain text
      const kids: InlineChild[] = [];
      el.childNodes.forEach((n) => pushInline(n, { ...st, color: LINK_BLUE, underline: true }, kids, b));
      if (kids.length) out.push(new ExternalHyperlink({ link: href, children: kids }));
      return;
    }
    case "IMG": {
      const src = el.getAttribute("src") ?? "";
      const pi = src ? b.images.get(src) : null;
      const alt = el.getAttribute("alt");
      if (pi) out.push(imageRun(pi, CONTENT_W, alt ?? ""));
      else {
        out.push(makeRun(`[图片${alt ? `：${alt}` : ""}]`, { ...st, color: GRAY })); // i18n-ignore part of the exported/copied content format; stays Chinese for now
      }
      return;
    }
    case "VIDEO": {
      const src = el.getAttribute("src");
      if (src) out.push(videoLink(src));
      return;
    }
    case "INPUT": {
      // Task list checkbox
      if (el.getAttribute("type") === "checkbox") {
        out.push(makeRun(el.hasAttribute("checked") ? "☑ " : "☐ ", st));
      }
      return;
    }
    case "SPAN": {
      // Editor font color (<span style="color:…">) maps to Word font color
      const c = (el as HTMLElement).style?.color;
      const hex = c ? cssColorToHex(c) : undefined;
      return recurse(hex ? { ...st, color: hex } : st);
    }
    default:
      return recurse(st);
  }

  // Declared after the switch and hoisted for use by the branches above, so each branch needs only one line: return recurse(...)
  function recurse(next: RunStyle): void {
    el.childNodes.forEach((n) => pushInline(n, next, out, b));
  }
}

/** Get all inline content of an element. Paragraphs and table cells upstream get their children from here. */
export function inlineOf(el: Element, b: Build, st: RunStyle = {}): InlineChild[] {
  const out: InlineChild[] = [];
  el.childNodes.forEach((n) => pushInline(n, st, out, b));
  return out;
}
