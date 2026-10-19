import { buildWechatHtml, type WechatBuildOptions } from "./copy/wechat";
import { saveExport } from "./export";

// A4 portrait, in pt
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_H = PAGE_H - MARGIN * 2;
// Offscreen render width (CSS px): a bit wider than the long image's 750; scaled into the A4 content area the font is ~10.5pt, close to print body size
const RENDER_W = 760;
const PIXEL_RATIO = 2;
const JPEG_QUALITY = 0.92;

/** Parse rgb()/rgba(); returns null if transparent or unparseable (treated as white) */
function parseRgb(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Greedy block paging: a block that fits joins the current page, otherwise starts a new one; a block taller than a page gets its own group and is hard-cut later */
function paginate(root: HTMLElement, pageLimit: number): HTMLElement[][] {
  const pages: HTMLElement[][] = [];
  let current: HTMLElement[] = [];
  let pageTop = 0;
  for (const el of Array.from(root.children) as HTMLElement[]) {
    const rect = el.getBoundingClientRect();
    if (rect.height > pageLimit) {
      if (current.length) pages.push(current);
      pages.push([el]);
      current = [];
      continue;
    }
    // From the top of the page's first block to the bottom of the current one: inter-block margins are already included
    if (current.length && rect.bottom - pageTop > pageLimit) {
      pages.push(current);
      current = [];
    }
    if (!current.length) pageTop = rect.top;
    current.push(el);
  }
  if (current.length) pages.push(current);
  return pages;
}

/** Export PDF: paginate by top-level blocks, screenshot each page, and assemble an A4 raster PDF. Returns false if the user canceled "Save As".
 *  We don't screenshot one long image and slice it: long docs hit the browser's canvas size limit, and cuts would land mid-line.
 *  On failure (usually cross-origin external images making html-to-image fail outright) it throws for the caller to report — lib doesn't know the UI layer */
export async function exportPdf(
  title: string,
  markdown: string,
  opts: WechatBuildOptions
): Promise<boolean> {
  return saveExport(title, ".pdf", "application/pdf", () => renderPdf(markdown, opts));
}

async function renderPdf(markdown: string, opts: WechatBuildOptions): Promise<Blob> {
  const html = await buildWechatHtml(markdown, opts);
  const holder = document.createElement("div");
  holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${RENDER_W}px;background:#fff;z-index:-1;`;
  // buildWechatHtml output is already sanitized by DOMPurify
  holder.innerHTML = html;
  document.body.appendChild(holder);
  try {
    const [{ jsPDF }, { toCanvas }] = await Promise.all([
      import("jspdf"),
      import("html-to-image"),
    ]);
    // Measuring/screenshotting before images and fonts are ready gives wrong block heights and blank images
    const imgs = Array.from(holder.querySelectorAll("img"));
    await Promise.all(imgs.map((img) => img.decode().catch(() => {})));
    await document.fonts?.ready;

    // buildWechatHtml strips all id/class at the end (WeChat doesn't want them), so we can't query #nice; take the root node
    const root = holder.firstElementChild as HTMLElement | null;
    if (!root) throw new Error("render failed");
    // Dark themes carry their own background: fill the screenshot and page margins with the same color, or white borders around dark text look jarring
    const rgb = parseRgb(getComputedStyle(root).backgroundColor);
    const bgColor = rgb ? `rgb(${rgb.join(",")})` : "#ffffff";

    const scale = CONTENT_W / RENDER_W; // CSS px → pt
    const pageLimit = CONTENT_H / scale; // CSS px height that fits on one page
    const groups = paginate(root, pageLimit);

    // Each page is a section cloned with the root styles: the theme's font/color/line-height live on the root node and would be lost if blocks moved out.
    // Zero the vertical padding, or every page would repeat the root's top/bottom spacing
    const rootStyle = root.getAttribute("style") ?? "";
    const pageEls = groups.map((blocks) => {
      const page = document.createElement("section");
      page.setAttribute("style", rootStyle);
      page.style.paddingTop = "0";
      page.style.paddingBottom = "0";
      page.style.marginTop = "0";
      page.style.marginBottom = "0";
      for (const b of blocks) page.appendChild(b);
      return page;
    });
    root.remove();
    for (const p of pageEls) holder.appendChild(p);

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    let pageCount = 0;
    const addPage = (canvas: HTMLCanvasElement) => {
      if (pageCount > 0) pdf.addPage();
      pageCount++;
      if (rgb) {
        pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
        pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
      }
      const h = (canvas.height / canvas.width) * CONTENT_W;
      pdf.addImage(canvas.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG", MARGIN, MARGIN, CONTENT_W, h);
    };

    for (const page of pageEls) {
      const canvas = await toCanvas(page, { pixelRatio: PIXEL_RATIO, backgroundColor: bgColor });
      // Canvas pixel height of one page's content area
      const sliceH = Math.floor((CONTENT_H * canvas.width) / CONTENT_W);
      // Paging measured heights in the original position; after moving into the page section they may differ by a few pixels:
      // allow a 2% tolerance and scale the whole page to fit, rather than cutting off a fragment page with just a line or two
      if (canvas.height <= sliceH * 1.02) {
        addPage(canvas);
        continue;
      }
      // Oversized blocks (long code blocks, large images) can only be hard-cut, one slice per page
      for (let y = 0; y < canvas.height; y += sliceH) {
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = Math.min(sliceH, canvas.height - y);
        const ctx = slice.getContext("2d");
        if (!ctx) throw new Error("canvas unavailable");
        ctx.drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
        addPage(slice);
      }
    }

    return pdf.output("blob");
  } finally {
    holder.remove();
  }
}
