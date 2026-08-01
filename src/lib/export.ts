import { buildWechatHtml, type WechatBuildOptions } from "./copy/wechat";
import { toast } from "@/components/Toast";

export function downloadFile(filename: string, content: BlobPart, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportMarkdown(title: string, markdown: string): void {
  downloadFile(`${title || "untitled"}.md`, markdown, "text/markdown;charset=utf-8");
}

async function buildStandaloneHtml(
  title: string,
  markdown: string,
  opts: WechatBuildOptions
): Promise<string> {
  const body = await buildWechatHtml(markdown, opts);
  return [
    "<!DOCTYPE html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title || "untitled"}</title>`,
    "</head>",
    '<body style="margin:0 auto;max-width:720px;padding:0 16px;">',
    body,
    "</body>",
    "</html>",
  ].join("\n");
}

export async function exportHtml(
  title: string,
  markdown: string,
  opts: WechatBuildOptions
): Promise<void> {
  downloadFile(
    `${title || "untitled"}.html`,
    // HTML 导出能直接播放，保留真 <video>；PDF/长图不可播，沿用默认的封面占位
    await buildStandaloneHtml(title, markdown, { ...opts, videoMode: "keep" }),
    "text/html;charset=utf-8"
  );
}

/** 通过隐藏 iframe 打印预览内容，用户在系统对话框中选择“存储为 PDF” */
export async function exportPdf(
  title: string,
  markdown: string,
  opts: WechatBuildOptions
): Promise<void> {
  const html = await buildStandaloneHtml(title, markdown, opts);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 60_000);
  };
}

/** 导出长图：以 750px 宽渲染内联样式版全文，转 PNG 下载 */
export async function exportImage(
  title: string,
  markdown: string,
  opts: WechatBuildOptions
): Promise<void> {
  const html = await buildWechatHtml(markdown, opts);
  const holder = document.createElement("div");
  holder.style.cssText =
    "position:fixed;left:-10000px;top:0;width:750px;background:#ffffff;z-index:-1;";
  // buildWechatHtml 产物已经过 DOMPurify 消毒
  holder.innerHTML = html;
  document.body.appendChild(holder);
  try {
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(holder, { pixelRatio: 2, backgroundColor: "#ffffff" });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${title || "untitled"}.png`;
    a.click();
  } catch {
    toast("长图生成失败（外链图片可能跨域受限）", "error");
  } finally {
    holder.remove();
  }
}
