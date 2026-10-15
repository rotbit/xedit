import { buildWechatHtml, type WechatBuildOptions } from "./copy/wechat";
import { saveExport } from "./export";

// A4 竖版，单位 pt
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_H = PAGE_H - MARGIN * 2;
// 离屏渲染宽度（CSS px）：比长图的 750 略宽，缩到 A4 内容区后字号约 10.5pt，接近正文印刷字号
const RENDER_W = 760;
const PIXEL_RATIO = 2;
const JPEG_QUALITY = 0.92;

/** 解析 rgb()/rgba()，透明或解析不了返回 null（当白底处理） */
function parseRgb(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** 按块贪心装页：块放得下就跟上一页，放不下换页；超过一页高的块独占一组，后面硬切 */
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
    // 从本页第一个块的顶到当前块的底：块间外边距已经算在里面
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

/** 导出 PDF：按顶层块分页、逐页截图后拼成 A4 栅格 PDF 保存。返回 false 表示用户取消了「另存为」。
 *  不整篇截一张长图再切：长文会撞浏览器 canvas 尺寸上限，且切口会落在文字行中间。
 *  失败（多是跨域外链图片让 html-to-image 整张失败）直接抛错，由调用方提示 —— lib 不认识 UI 层 */
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
  // buildWechatHtml 产物已经过 DOMPurify 消毒
  holder.innerHTML = html;
  document.body.appendChild(holder);
  try {
    const [{ jsPDF }, { toCanvas }] = await Promise.all([
      import("jspdf"),
      import("html-to-image"),
    ]);
    // 图片和字体没就绪就测量/截图，会拿到错的块高度和空白图
    const imgs = Array.from(holder.querySelectorAll("img"));
    await Promise.all(imgs.map((img) => img.decode().catch(() => {})));
    await document.fonts?.ready;

    // buildWechatHtml 最后会把 id/class 全剥掉（公众号不要这些），不能按 #nice 查，取根节点
    const root = holder.firstElementChild as HTMLElement | null;
    if (!root) throw new Error("render failed");
    // 深色主题自带底色：截图与页边距都铺同一个颜色，否则白边框着深色正文很突兀
    const rgb = parseRgb(getComputedStyle(root).backgroundColor);
    const bgColor = rgb ? `rgb(${rgb.join(",")})` : "#ffffff";

    const scale = CONTENT_W / RENDER_W; // CSS px → pt
    const pageLimit = CONTENT_H / scale; // 一页能放的 CSS px 高度
    const groups = paginate(root, pageLimit);

    // 每页是一个克隆了根样式的 section：主题的字体/颜色/行高都挂在根节点上，块挪出去会丢。
    // 竖向内边距清零，不然每页都会重复一遍根部的上下留白
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
      // 一页内容区对应的画布像素高度
      const sliceH = Math.floor((CONTENT_H * canvas.width) / CONTENT_W);
      // 分页时量的是原位置的高度，挪进 page section 后可能差几个像素：
      // 给 2% 容差整页缩放塞下，别切出一张只剩一两行的碎页
      if (canvas.height <= sliceH * 1.02) {
        addPage(canvas);
        continue;
      }
      // 超高块（长代码块、大图）只能硬切，每片一页
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
