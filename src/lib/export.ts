import { buildWechatHtml, type WechatBuildOptions } from "./copy/wechat";

function downloadFile(filename: string, content: string, mime: string): void {
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
    '<body style="margin:0 auto;max-width:720px;">',
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
    await buildStandaloneHtml(title, markdown, opts),
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
