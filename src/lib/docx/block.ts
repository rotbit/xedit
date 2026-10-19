// Word export · block conversion: block-level DOM nodes (paragraphs/headings/lists/tables/code blocks/quotes/images/videos, etc.) → Paragraph / Table.

import {
  AlignmentType,
  BorderStyle,
  type IParagraphOptions,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { imageRun, inlineOf, mathImage, pushInline, videoLink } from "./inline";
import { BLOCK_TAGS, GRAY, HEADINGS, MONO_FONT, OL_REF, CONTENT_W } from "./types";
import type { Build, BlockChild, InlineChild, PreparedImage } from "./types";

// -- Layout dimensions --
// In docx, lengths are in DXA (1/20 pt, 1440 DXA = 1 inch), font sizes in half-points, and border widths in 1/8 pt.
// The three units' value ranges overlap (all two or three digits), so they're all named constants annotated with units.

/** First-level list left indent: 720 DXA = 0.5 inch, matching Word's default list indent */
const LIST_INDENT_DXA = 720;
/** Extra indent per nested list level: 480 DXA = 1/3 inch */
const LIST_INDENT_STEP_DXA = 480;
/** Left indent per quote level: 240 DXA = 1/6 inch, accumulated for nested quotes */
const QUOTE_INDENT_STEP_DXA = 240;
/** Quote left-bar width: 18/8 = 2.25 pt (border units are 1/8 pt, not DXA) */
const QUOTE_BORDER_EIGHTH_PT = 18;
/** Small font size for captions and code blocks: 18/2 = 9 pt (font size units are half-points, not DXA) */
const SMALL_FONT_HALF_PT = 18;

// -- Block nodes → Paragraph / Table --

interface Ctx {
  quote: number;
}

function quoteOpts(ctx: Ctx): Pick<IParagraphOptions, "border" | "indent"> {
  if (!ctx.quote) return {};
  return {
    border: {
      left: { style: BorderStyle.SINGLE, size: QUOTE_BORDER_EIGHTH_PT, color: "D0D3D6", space: 8 },
    },
    indent: { left: QUOTE_INDENT_STEP_DXA * ctx.quote },
  };
}

function captionPara(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, size: SMALL_FONT_HALF_PT, color: GRAY })],
    spacing: { before: 0, after: 200 },
  });
}

function imagePara(pi: PreparedImage, alt = ""): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [imageRun(pi, CONTENT_W, alt)],
    spacing: { before: 120, after: 120 },
  });
}

function placeholderPara(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, color: GRAY })],
  });
}

/** Video block: poster image (if any) + play link + bare URL (still copyable if the hyperlink is lost) */
function videoBlocks(video: Element, caption: string, b: Build): Paragraph[] {
  const src = video.getAttribute("src") ?? video.querySelector("source")?.getAttribute("src") ?? "";
  if (!src) return [];
  const out: Paragraph[] = [];
  const posterImg = b.frames.get(video);
  if (posterImg) out.push(imagePara(posterImg, caption));
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [videoLink(src)],
      spacing: { before: posterImg ? 0 : 160, after: 40 },
    })
  );
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: src, size: 16, color: GRAY })],
      spacing: { after: 160 },
    })
  );
  if (caption) out.push(captionPara(caption));
  return out;
}

function figureBlocks(el: Element, ctx: Ctx, b: Build): BlockChild[] {
  const caption = el.querySelector(":scope > figcaption")?.textContent?.trim() ?? "";
  const video = el.querySelector(":scope > video");
  if (video) return videoBlocks(video, caption, b);
  const img = el.querySelector(":scope > img");
  if (img) {
    const src = img.getAttribute("src") ?? "";
    const pi = src ? b.images.get(src) : null;
    const alt = img.getAttribute("alt");
    const out: Paragraph[] = [];
    if (pi) out.push(imagePara(pi, alt ?? caption));
    else {
      out.push(placeholderPara(`[图片${alt ? `：${alt}` : ""}]`)); // i18n-ignore part of the exported/copied content format; stays Chinese for now
    }
    if (caption) out.push(captionPara(caption));
    return out;
  }
  return childBlocks(el, ctx, b);
}

function codeBlocks(pre: Element): Paragraph[] {
  const lines = (pre.textContent ?? "").replace(/\n$/, "").split("\n");
  return lines.map(
    (line, i) =>
      new Paragraph({
        children: [
          new TextRun({ text: line || " ", font: MONO_FONT, size: SMALL_FONT_HALF_PT }),
        ],
        shading: { type: ShadingType.CLEAR, fill: "F6F8FA" },
        spacing: { before: i === 0 ? 120 : 0, after: i === lines.length - 1 ? 160 : 0, line: 260 },
      })
  );
}

function tableBlock(tableEl: Element, b: Build): Table {
  const rows = Array.from(tableEl.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr"));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (tr) =>
        new TableRow({
          children: Array.from(tr.children).map((cell) => {
            const isTh = cell.tagName === "TH";
            const alignMatch = (cell.getAttribute("style") ?? "").match(/text-align:\s*(center|right)/);
            return new TableCell({
              children: [
                new Paragraph({
                  children: inlineOf(cell, b, isTh ? { bold: true } : {}),
                  alignment:
                    alignMatch?.[1] === "center"
                      ? AlignmentType.CENTER
                      : alignMatch?.[1] === "right"
                        ? AlignmentType.RIGHT
                        : undefined,
                  spacing: { after: 0 },
                }),
              ],
              shading: isTh ? { type: ShadingType.CLEAR, fill: "F2F3F5" } : undefined,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
            });
          }),
        })
    ),
  });
}

/** Trim leading/trailing newlines/whitespace from a run of inline nodes (the newline in source like `Item 2\n<ul>` would become trailing whitespace in Word) */
function trimEdgeWhitespace(nodes: Node[]): void {
  const first = nodes[0];
  if (first?.nodeType === Node.TEXT_NODE) first.textContent = (first.textContent ?? "").replace(/^\s+/, "");
  const last = nodes[nodes.length - 1];
  if (last?.nodeType === Node.TEXT_NODE) last.textContent = (last.textContent ?? "").replace(/\s+$/, "");
}

function listBlocks(listEl: Element, level: number, b: Build): BlockChild[] {
  const ordered = listEl.tagName === "OL";
  const instance = ordered ? b.olInstance++ : 0;
  const indentLeft = LIST_INDENT_DXA + LIST_INDENT_STEP_DXA * level;
  const out: BlockChild[] = [];

  const marker = (first: boolean) => {
    if (!first) return { indent: { left: indentLeft } };
    return ordered
      ? { numbering: { reference: OL_REF, level: Math.min(level, 3), instance } }
      : { bullet: { level: Math.min(level, 8) } };
  };

  for (const li of Array.from(listEl.children)) {
    if (li.tagName !== "LI") continue;
    // Split li content into blocks: inline content groups into paragraphs, nested lists and block elements are handled separately.
    // markdown-it emits newlines around <p>/<ul> inside <li> (loose lists wrap every item in <p>);
    // these whitespace-only text nodes aren't content: treating them as a paragraph puts the number on an empty line and pushes the text to the next line without a number
    const chunks: (Node[] | Element)[] = [];
    let acc: Node[] = [];
    const flush = () => {
      if (acc.some((n) => n.nodeType === Node.ELEMENT_NODE || n.textContent?.trim())) {
        chunks.push(acc);
      }
      acc = [];
    };
    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((child as Element).tagName)) {
        flush();
        chunks.push(child as Element);
      } else acc.push(child);
    }
    flush();

    let first = true;
    for (const chunk of chunks) {
      if (Array.isArray(chunk) || chunk.tagName === "P") {
        const nodes = Array.isArray(chunk) ? chunk : Array.from(chunk.childNodes);
        trimEdgeWhitespace(nodes);
        const runs: InlineChild[] = [];
        nodes.forEach((n) => pushInline(n, {}, runs, b));
        if (!runs.length && !first) continue;
        out.push(new Paragraph({ children: runs, ...marker(first), spacing: { after: 60 } }));
        first = false;
      } else if (chunk.tagName === "UL" || chunk.tagName === "OL") {
        out.push(...listBlocks(chunk, level + 1, b));
      } else {
        out.push(...blockOf(chunk, { quote: 0 }, b));
      }
    }
  }
  return out;
}

/** Split paragraphs containing images/videos at media positions: text groups into paragraphs, media become standalone blocks, and newlines next to media don't produce empty paragraphs */
function splitMediaParagraph(el: Element, ctx: Ctx, b: Build): BlockChild[] {
  const isBr = (n: Node) => n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === "BR";
  const out: BlockChild[] = [];
  let acc: Node[] = [];
  const flushText = () => {
    while (acc.length && isBr(acc[0])) acc.shift();
    while (acc.length && isBr(acc[acc.length - 1])) acc.pop();
    if (acc.some((n) => n.textContent?.trim())) {
      const runs: InlineChild[] = [];
      acc.forEach((n) => pushInline(n, {}, runs, b));
      if (runs.length) out.push(new Paragraph({ children: runs, ...quoteOpts(ctx) }));
    }
    acc = [];
  };
  for (const node of Array.from(el.childNodes)) {
    const child = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : null;
    if (child?.tagName === "VIDEO") {
      flushText();
      out.push(...videoBlocks(child, "", b));
    } else if (child?.tagName === "IMG") {
      flushText();
      const src = child.getAttribute("src") ?? "";
      const pi = src ? b.images.get(src) : null;
      const alt = child.getAttribute("alt");
      if (pi) out.push(imagePara(pi, alt ?? ""));
      else {
        out.push(placeholderPara(`[图片${alt ? `：${alt}` : ""}]`)); // i18n-ignore part of the exported/copied content format; stays Chinese for now
      }
    } else {
      acc.push(node);
    }
  }
  flushText();
  return out;
}

function blockOf(el: Element, ctx: Ctx, b: Build): BlockChild[] {
  const tag = el.tagName;

  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    const content = el.querySelector(":scope > span.content") ?? el;
    return [new Paragraph({ heading: HEADINGS[level - 1], children: inlineOf(content, b) })];
  }

  switch (tag) {
    case "P": {
      // Empty paragraphs (preserved blank lines) export as blank lines
      if (!el.textContent?.trim() && !el.querySelector("img, video")) return [new Paragraph({})];
      // In the preview, images/videos are block-level on their own line (even when a single newline squeezes them into a paragraph); export matches that:
      // split the paragraph at media nodes, restoring full cards for videos and centered full images for images
      if (el.querySelector(":scope > img, :scope > video")) return splitMediaParagraph(el, ctx, b);
      return [new Paragraph({ children: inlineOf(el, b), ...quoteOpts(ctx) })];
    }
    case "FIGURE":
      return figureBlocks(el, ctx, b);
    case "VIDEO":
      return videoBlocks(el, "", b);
    case "PRE":
      return codeBlocks(el);
    case "BLOCKQUOTE":
      return childBlocks(el, { quote: ctx.quote + 1 }, b);
    case "UL":
    case "OL":
      return listBlocks(el, 0, b);
    case "HR":
      return [
        new Paragraph({
          spacing: { before: 60, after: 240 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D9DCE1" } },
        }),
      ];
    case "TABLE":
      return [tableBlock(el, b)];
    case "SECTION":
    case "DIV":
    case "ARTICLE": {
      if (el.classList.contains("table-container")) {
        const table = el.querySelector("table");
        return table ? [tableBlock(table, b)] : [];
      }
      if (el.classList.contains("math")) {
        return [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [mathImage(el, {}, b)],
            spacing: { before: 120, after: 120 },
          }),
        ];
      }
      return childBlocks(el, ctx, b);
    }
    default: {
      // Inline elements at the top level (raw HTML embedded in Markdown) fall back to a paragraph
      const runs = inlineOf(el, b);
      return runs.length ? [new Paragraph({ children: runs, ...quoteOpts(ctx) })] : [];
    }
  }
}

/** Walk container children: block elements map recursively, stray inline nodes are grouped into paragraphs */
export function childBlocks(container: Element, ctx: Ctx, b: Build): BlockChild[] {
  const out: BlockChild[] = [];
  let acc: Node[] = [];
  const flush = () => {
    if (acc.some((n) => n.textContent?.trim())) {
      const runs: InlineChild[] = [];
      acc.forEach((n) => pushInline(n, {}, runs, b));
      if (runs.length) out.push(new Paragraph({ children: runs, ...quoteOpts(ctx) }));
    }
    acc = [];
  };
  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName)) {
      flush();
      out.push(...blockOf(node as Element, ctx, b));
    } else acc.push(node);
  }
  flush();
  return out;
}
