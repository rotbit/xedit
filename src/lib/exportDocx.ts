import {
  AlignmentType,
  BorderStyle,
  Document,
  type IParagraphOptions,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { downloadFile } from "@/lib/export";
import { toast } from "@/components/Toast";

// 导出 Word（.docx）：把 Markdown 渲染成语义 HTML 后逐节点映射为 OOXML。
// 目标是导入飞书/Word 后保留结构（标题层级、列表、表格、图片、代码块、公式），
// 而非还原公众号主题视觉——导入方会重排样式，语义结构才是可迁移的部分。
// 视频无法嵌入 docx（Word 只有"联机视频"链接机制），导出为封面图 + 可点击的播放链接。

/** 正文可用宽度（px @96dpi）：A4 减去默认页边距 */
const CONTENT_W = 600;
const BODY_FONT = { ascii: "Calibri", hAnsi: "Calibri", eastAsia: "微软雅黑" };
const MONO_FONT = { ascii: "Consolas", hAnsi: "Consolas", eastAsia: "微软雅黑" };
const INK = "1F2329";
const GRAY = "8A8F99";
const LINK_BLUE = "1155CC";
const OL_REF = "xe-ol";

interface PreparedImage {
  data: ArrayBuffer;
  type: "png" | "jpg" | "gif";
  width: number;
  height: number;
}

interface Build {
  /** src → 已就绪的图片字节；null 表示获取失败 */
  images: Map<string, PreparedImage | null>;
  /** 公式节点 → 栅格化后的 PNG */
  math: Map<Element, PreparedImage | null>;
  /** 视频节点 → 封面帧（poster 或抓取的首帧）；null 表示拿不到 */
  frames: Map<Element, PreparedImage | null>;
  olInstance: number;
  failed: number;
}

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  underline?: boolean;
  code?: boolean;
  sup?: boolean;
  sub?: boolean;
  color?: string;
  size?: number;
}

type InlineChild = TextRun | ImageRun | ExternalHyperlink;
type BlockChild = Paragraph | Table;

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

const BLOCK_TAGS = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "FIGURE", "BLOCKQUOTE", "PRE",
  "UL", "OL", "TABLE", "HR", "VIDEO", "H1", "H2", "H3", "H4", "H5", "H6",
]);

// —— 媒体准备：并发拉取全部图片字节，之后的树遍历即可保持同步 ——

async function fetchBlob(url: string): Promise<Blob | null> {
  if (url.startsWith("data:")) {
    try {
      return await (await fetch(url)).blob();
    } catch {
      return null;
    }
  }
  // 直连优先；图床未配 CORS 时退回同源代理
  try {
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) return await res.blob();
  } catch {
    /* 跨域被拦，走代理 */
  }
  try {
    const res = await fetch(`/api/export/media?url=${encodeURIComponent(url)}`);
    if (res.ok) return await res.blob();
  } catch {
    /* 代理也失败，按缺图处理 */
  }
  return null;
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** 经 canvas 转成 PNG（webp/svg 等 Word 不认的格式，以及公式的高清放大） */
async function rasterizeToPng(blob: Blob, scale: number): Promise<PreparedImage | null> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadHtmlImage(url);
    const w = img.naturalWidth || img.width || 300;
    const h = img.naturalHeight || img.height || 150;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!png) return null;
    return { data: await png.arrayBuffer(), type: "png", width: w, height: h };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sniffKind(bytes: Uint8Array): "png" | "jpg" | "gif" | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  return null;
}

async function blobToImage(blob: Blob): Promise<PreparedImage | null> {
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  const kind = sniffKind(head);
  if (kind) {
    try {
      const bmp = await createImageBitmap(blob);
      const data = await blob.arrayBuffer();
      return { data, type: kind, width: bmp.width, height: bmp.height };
    } catch {
      /* 解码失败则走 canvas 兜底 */
    }
  }
  return rasterizeToPng(blob, 1);
}

/** 抓取视频首帧作封面：依赖视频源允许跨域读取（本站 OSS 为支持直传已配 CORS），失败或超时降级为无封面 */
function captureVideoFrame(src: string): Promise<PreparedImage | null> {
  const capture = new Promise<PreparedImage | null>((resolve) => {
    const v = document.createElement("video");
    let settled = false;
    const done = (r: PreparedImage | null) => {
      if (settled) return;
      settled = true;
      v.removeAttribute("src");
      v.load();
      resolve(r);
    };
    v.crossOrigin = "anonymous";
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.onerror = () => done(null);
    v.onloadedmetadata = () => {
      // 跳过纯黑的第 0 帧，取 0.1s（短视频取中点兜底）
      v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
    };
    v.onseeked = () => {
      try {
        const w = v.videoWidth;
        const h = v.videoHeight;
        if (!w || !h) return done(null);
        const scale = Math.min(1, 1280 / w);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return done(null);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) return done(null);
          void blob.arrayBuffer().then((data) =>
            done({ data, type: "png", width: canvas.width, height: canvas.height })
          );
        }, "image/png");
      } catch {
        done(null); // 源站未放开 CORS 时 canvas 被污染，drawImage/toBlob 会抛
      }
    };
    v.src = src;
  });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
  return Promise.race([capture, timeout]);
}

async function prepareMedia(root: HTMLElement, b: Build): Promise<void> {
  const urls = new Set<string>();
  root.querySelectorAll("img").forEach((el) => {
    const src = el.getAttribute("src");
    if (src) urls.add(src);
  });
  root.querySelectorAll("video[poster]").forEach((el) => {
    const poster = el.getAttribute("poster");
    if (poster) urls.add(poster);
  });
  await Promise.all(
    Array.from(urls).map(async (url) => {
      const blob = await fetchBlob(url);
      const img = blob ? await blobToImage(blob) : null;
      if (!img) b.failed += 1;
      b.images.set(url, img);
    })
  );
  // 视频封面：优先 poster（已随图片批量拉取），否则现场抓首帧
  await Promise.all(
    Array.from(root.querySelectorAll("video")).map(async (v) => {
      const poster = v.getAttribute("poster");
      const fromPoster = poster ? (b.images.get(poster) ?? null) : null;
      const src = v.getAttribute("src") ?? "";
      b.frames.set(v, fromPoster ?? (src ? await captureVideoFrame(src) : null));
    })
  );
  // 公式：MathJax SVG 栅格化为 2x PNG；没有 SVG（MathJax 未就绪）留 null，走 TeX 文本兜底
  for (const el of Array.from(root.querySelectorAll(".math"))) {
    const svg = el.querySelector("svg");
    if (!svg) {
      b.math.set(el, null);
      continue;
    }
    const xml = new XMLSerializer().serializeToString(svg);
    b.math.set(el, await rasterizeToPng(new Blob([xml], { type: "image/svg+xml" }), 2));
  }
}

// —— 行内节点 → TextRun / ImageRun / 超链接 ——

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

function fit(pi: PreparedImage, maxW: number): { width: number; height: number } {
  const scale = Math.min(1, maxW / pi.width);
  return { width: Math.round(pi.width * scale), height: Math.round(pi.height * scale) };
}

function imageRun(pi: PreparedImage, maxW = CONTENT_W): ImageRun {
  return new ImageRun({ type: pi.type, data: pi.data, transformation: fit(pi, maxW) });
}

function videoLink(src: string): ExternalHyperlink {
  return new ExternalHyperlink({
    link: src,
    children: [new TextRun({ text: "▶ 点击观看视频", bold: true, color: LINK_BLUE, underline: {} })],
  });
}

function mathImage(el: Element, st: RunStyle, b: Build): InlineChild {
  const pi = b.math.get(el);
  if (pi) return imageRun(pi);
  const tex = el.getAttribute("data-tex") ?? el.textContent ?? "";
  return makeRun(tex, { ...st, italics: true });
}

function pushInline(node: Node, st: RunStyle, out: InlineChild[], b: Build): void {
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
    default:
      return recurse(st);
  }

  function recurse(next: RunStyle): void {
    el.childNodes.forEach((n) => pushInline(n, next, out, b));
  }
}

function inlineOf(el: Element, b: Build, st: RunStyle = {}): InlineChild[] {
  const out: InlineChild[] = [];
  el.childNodes.forEach((n) => pushInline(n, st, out, b));
  return out;
}

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
function childBlocks(container: Element, ctx: Ctx, b: Build): BlockChild[] {
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

// —— 文档组装 ——

const NUMBERING = {
  config: [
    {
      reference: OL_REF,
      levels: [0, 1, 2, 3].map((level) => ({
        level,
        format: LevelFormat.DECIMAL,
        text: `%${level + 1}.`,
        alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 720 + 480 * level, hanging: 360 } } },
      })),
    },
  ],
};

const heading = (size: number, before: number, after: number) => ({
  run: { size, bold: true, color: INK, font: BODY_FONT },
  paragraph: { spacing: { before, after } },
});

const STYLES = {
  default: {
    document: {
      run: { size: 22, color: INK, font: BODY_FONT },
      paragraph: { spacing: { after: 160, line: 300 } },
    },
    heading1: heading(36, 320, 200),
    heading2: heading(32, 280, 180),
    heading3: heading(28, 240, 160),
    heading4: heading(26, 200, 140),
    heading5: heading(24, 160, 120),
    heading6: heading(22, 160, 120),
  },
};

export async function exportDocx(title: string, markdown: string): Promise<void> {
  try {
    // 公式渲染依赖 MathJax；未加载成功时降级为 TeX 文本
    if (markdown.includes("$")) await ensureMathJax().catch(() => undefined);
    const html = sanitizeHtml(renderMarkdown(markdown, {}));
    const body = new DOMParser().parseFromString(html, "text/html").body;
    const b: Build = { images: new Map(), math: new Map(), frames: new Map(), olInstance: 0, failed: 0 };
    await prepareMedia(body, b);
    const children = childBlocks(body, { quote: 0 }, b);
    const doc = new Document({
      numbering: NUMBERING,
      styles: STYLES,
      sections: [{ children: children.length ? children : [new Paragraph({})] }],
    });
    downloadFile(
      `${title || "untitled"}.docx`,
      await Packer.toBlob(doc),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    if (b.failed) toast(`已导出，但 ${b.failed} 个图片未能嵌入（获取失败）`, "error");
    else toast("Word 文档已导出");
  } catch {
    toast("Word 生成失败", "error");
  }
}
