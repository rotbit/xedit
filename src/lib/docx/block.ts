// 导出 Word · 块级转换：段落/标题/列表/表格/代码块/引用/图片视频等块级 DOM 节点 → Paragraph / Table。

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
import { BLOCK_TAGS, GRAY, HEADINGS, MONO_FONT, OL_REF } from "./types";
import type { Build, BlockChild, InlineChild, PreparedImage } from "./types";

// —— 块级节点 → Paragraph / Table ——

interface Ctx {
  quote: number;
}

function quoteOpts(ctx: Ctx): Pick<IParagraphOptions, "border" | "indent"> {
  if (!ctx.quote) return {};
  return {
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: "D0D3D6", space: 8 } },
    indent: { left: 240 * ctx.quote },
  };
}

function captionPara(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, size: 18, color: GRAY })],
    spacing: { before: 0, after: 200 },
  });
}

function imagePara(pi: PreparedImage): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [imageRun(pi)],
    spacing: { before: 120, after: 120 },
  });
}

function placeholderPara(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, color: GRAY })],
  });
}

/** 视频块：封面图（如有）+ 播放链接 + 裸链接（超链接丢失时仍可复制打开） */
function videoBlocks(video: Element, caption: string, b: Build): Paragraph[] {
  const src = video.getAttribute("src") ?? video.querySelector("source")?.getAttribute("src") ?? "";
  if (!src) return [];
  const out: Paragraph[] = [];
  const posterImg = b.frames.get(video);
  if (posterImg) out.push(imagePara(posterImg));
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
    const out: Paragraph[] = [];
    if (pi) out.push(imagePara(pi));
    else {
      const alt = img.getAttribute("alt");
      out.push(placeholderPara(`[图片${alt ? `：${alt}` : ""}]`));
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
        children: [new TextRun({ text: line || " ", font: MONO_FONT, size: 18 })],
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

function listBlocks(listEl: Element, level: number, b: Build): BlockChild[] {
  const ordered = listEl.tagName === "OL";
  const instance = ordered ? b.olInstance++ : 0;
  const indentLeft = 720 + 480 * level;
  const out: BlockChild[] = [];

  const marker = (first: boolean) => {
    if (!first) return { indent: { left: indentLeft } };
    return ordered
      ? { numbering: { reference: OL_REF, level: Math.min(level, 3), instance } }
      : { bullet: { level: Math.min(level, 8) } };
  };

  for (const li of Array.from(listEl.children)) {
    if (li.tagName !== "LI") continue;
    // li 内容切块：行内内容聚为段落，嵌套列表与块级元素单独处理
    const chunks: (Node[] | Element)[] = [];
    let acc: Node[] = [];
    const flush = () => {
      if (acc.length) chunks.push(acc);
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
        const runs: InlineChild[] = [];
        if (Array.isArray(chunk)) chunk.forEach((n) => pushInline(n, {}, runs, b));
        else chunk.childNodes.forEach((n) => pushInline(n, {}, runs, b));
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

/** 把含图片/视频的段落按媒体位置切分：文字聚段、媒体独立成块，媒体紧邻的换行不产生空段 */
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
      if (pi) out.push(imagePara(pi));
      else {
        const alt = child.getAttribute("alt");
        out.push(placeholderPara(`[图片${alt ? `：${alt}` : ""}]`));
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
      // 空段落（保留的空行）导出为空行
      if (!el.textContent?.trim() && !el.querySelector("img, video")) return [new Paragraph({})];
      // 预览里图片/视频均为块级独占一行（含单回车换行挤进段落的情况），导出保持一致：
      // 按媒体节点把段落切开，视频恢复完整卡片，图片恢复居中整图
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
      // 顶层出现的行内元素（Markdown 内嵌原始 HTML）按段落兜底
      const runs = inlineOf(el, b);
      return runs.length ? [new Paragraph({ children: runs, ...quoteOpts(ctx) })] : [];
    }
  }
}

/** 遍历容器子节点：块级元素递归映射，散落的行内节点聚合成段落 */
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
