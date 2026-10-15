import { buildWechatHtml, type WechatBuildOptions } from "./copy/wechat";

// File System Access API 的「另存为」：lib.dom 未收录类型，这里只声明用到的最小子集
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}
declare global {
  interface Window {
    showSaveFilePicker?: (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }
}

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

export interface SaveTarget {
  write(content: BlobPart, mime: string): Promise<void>;
  discard(): Promise<void>;
}

/** 先弹「另存为」再生成：Chrome 的用户手势激活只有约 5 秒，长文生成完再弹会被拦。
 *  用户取消返回 null；浏览器不支持 showSaveFilePicker 时返回退化目标（write 走 downloadFile） */
export async function openSaveTarget(
  filename: string,
  mime: string,
  ext: string
): Promise<SaveTarget | null> {
  const fallback: SaveTarget = {
    write: async (content, writeMime) => downloadFile(filename, content, writeMime),
    discard: async () => {},
  };
  if (typeof window === "undefined" || !window.showSaveFilePicker) return fallback;
  let handle: FileSystemFileHandle;
  try {
    handle = await window.showSaveFilePicker({
      suggestedName: filename,
      // accept 的 key 必须是纯 mime，带 ;charset=… 会被判为非法参数
      types: [{ description: ext.slice(1).toUpperCase(), accept: { [mime.split(";")[0]]: [ext] } }],
    });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return null;
    // Electron 壳、跨域 iframe 等环境 API 存在但不让用（SecurityError 等），退回直接下载
    return fallback;
  }
  return {
    async write(content, writeMime) {
      const writable = await handle.createWritable();
      await writable.write(new Blob([content], { type: writeMime }));
      await writable.close();
    },
    async discard() {
      // 挑完文件 Chrome 已在磁盘上建了空文件，生成失败时尽量删掉；remove() 非标准，没有就算了
      try {
        await (handle as unknown as { remove?: () => Promise<void> }).remove?.();
      } catch {
        /* 删不掉只是留个空文件，不值得再打扰用户 */
      }
    },
  };
}

/** 导出统一流程：先选位置（取消返回 false，不提示），确定后才调 onBegin（UI 层借此弹「正在生成…」），
 *  再生成并写入；生成或写入失败时清掉空文件后把错误继续抛给调用方 */
export async function saveExport(
  title: string,
  ext: string,
  mime: string,
  produce: () => Promise<BlobPart>,
  onBegin?: () => void
): Promise<boolean> {
  const target = await openSaveTarget(`${title || "untitled"}${ext}`, mime, ext);
  if (!target) return false;
  onBegin?.();
  try {
    await target.write(await produce(), mime);
  } catch (e) {
    await target.discard();
    throw e;
  }
  return true;
}

export async function exportMarkdown(title: string, markdown: string): Promise<boolean> {
  return saveExport(title, ".md", "text/markdown;charset=utf-8", async () => markdown);
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
): Promise<boolean> {
  return saveExport(
    title,
    ".html",
    "text/html;charset=utf-8",
    // HTML 导出能直接播放，保留真 <video>；PDF/长图不可播，沿用默认的封面占位
    () => buildStandaloneHtml(title, markdown, { ...opts, videoMode: "keep" })
  );
}

/** 导出长图：以 750px 宽渲染内联样式版全文，转 PNG 保存。返回 false 表示用户取消了「另存为」。
 *  失败（多是跨域外链图片）时直接抛错，由调用方决定怎么提示 —— lib 不认识 UI 层 */
export async function exportImage(
  title: string,
  markdown: string,
  opts: WechatBuildOptions,
  onBegin?: () => void
): Promise<boolean> {
  return saveExport(title, ".png", "image/png", () => renderPng(markdown, opts), onBegin);
}

async function renderPng(markdown: string, opts: WechatBuildOptions): Promise<Blob> {
  const html = await buildWechatHtml(markdown, opts);
  const holder = document.createElement("div");
  holder.style.cssText =
    "position:fixed;left:-10000px;top:0;width:750px;background:#ffffff;z-index:-1;";
  // buildWechatHtml 产物已经过 DOMPurify 消毒
  holder.innerHTML = html;
  document.body.appendChild(holder);
  try {
    const { toBlob } = await import("html-to-image");
    const blob = await toBlob(holder, { pixelRatio: 2, backgroundColor: "#ffffff" });
    if (!blob) throw new Error("toBlob returned null");
    return blob;
  } finally {
    holder.remove();
  }
}
