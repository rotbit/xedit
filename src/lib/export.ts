import { buildWechatHtml, type WechatBuildOptions } from "./copy/wechat";

export function downloadFile(filename: string, content: BlobPart, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // click() 只是把下载排进队列，浏览器随后才真正去读这个 blob URL：
  // 同步 revoke 会让下载拿到一个空文件（Safari/Firefox 尤其明显），留一秒再释放
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  if (!doc) {
    // 拿不到文档就写不进内容，可 iframe 已经插进 body 了，先摘掉再退出，别留个空壳
    iframe.remove();
    return;
  }
  // 打印只该发生一次，下面两条触发路径都从这里收口
  let printed = false;
  const printOnce = () => {
    if (printed) return;
    printed = true;
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 60_000);
  };
  // onload 要挂在 doc.open() 之前：正文没有外链资源时 load 可能在 close() 里就派发掉，
  // 挂晚了这个回调永远不跑 —— 表现是「导出 PDF 点了没反应」，还漏一个 iframe 在 body 上。
  // 再拿 readyState 兜一道底，覆盖 load 已经错过的情况。
  iframe.onload = printOnce;
  doc.open();
  doc.write(html);
  doc.close();
  requestAnimationFrame(() => {
    if (doc.readyState === "complete") printOnce();
  });
}

/** 导出长图：以 750px 宽渲染内联样式版全文，转 PNG 下载。
 *  失败（多是跨域外链图片）时直接抛错，由调用方决定怎么提示 —— lib 不认识 UI 层 */
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
  } finally {
    holder.remove();
  }
}
