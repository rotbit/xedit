import { buildWechatHtml, type WechatBuildOptions } from "./copy/wechat";

// File System Access API "Save As": not in lib.dom types, so only the minimal subset we use is declared here
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
  // click() only queues the download; the browser reads the blob URL afterwards:
  // revoking synchronously gives the download an empty file (especially on Safari/Firefox), so wait a second before releasing
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface SaveTarget {
  write(content: BlobPart, mime: string): Promise<void>;
  discard(): Promise<void>;
}

/** Show "Save As" first, then generate: Chrome's user-gesture activation lasts only ~5s, so prompting after a long generation gets blocked.
 *  Returns null if the user cancels; returns a fallback target when showSaveFilePicker isn't supported (write goes through downloadFile) */
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
      // accept keys must be bare MIME types; a ;charset=… suffix is rejected as invalid
      types: [{ description: ext.slice(1).toUpperCase(), accept: { [mime.split(";")[0]]: [ext] } }],
    });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return null;
    // In the Electron shell, cross-origin iframes, etc. the API exists but is blocked (SecurityError etc.), so fall back to a direct download
    return fallback;
  }
  return {
    async write(content, writeMime) {
      const writable = await handle.createWritable();
      await writable.write(new Blob([content], { type: writeMime }));
      await writable.close();
    },
    async discard() {
      // Once a file is picked Chrome has already created an empty file on disk, so try to delete it on failure; remove() is non-standard, skip if missing
      try {
        await (handle as unknown as { remove?: () => Promise<void> }).remove?.();
      } catch {
        /* Failing to delete just leaves an empty file; not worth bothering the user again */
      }
    },
  };
}

/** Unified export flow: pick a location first (cancel returns false, no prompt), then generate and write;
 *  on generation or write failure, remove the empty file and rethrow to the caller */
export async function saveExport(
  title: string,
  ext: string,
  mime: string,
  produce: () => Promise<BlobPart>
): Promise<boolean> {
  const target = await openSaveTarget(`${title || "untitled"}${ext}`, mime, ext);
  if (!target) return false;
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
    // HTML export can play video, so keep the real <video>; PDF/long image can't, so use the default cover placeholder
    () => buildStandaloneHtml(title, markdown, { ...opts, videoMode: "keep" })
  );
}

/** Export as a long image: render the inline-styled full text at 750px wide and save as PNG. Returns false if the user canceled "Save As".
 *  On failure (usually cross-origin external images) it throws, and the caller decides how to report it — lib doesn't know the UI layer */
export async function exportImage(
  title: string,
  markdown: string,
  opts: WechatBuildOptions
): Promise<boolean> {
  return saveExport(title, ".png", "image/png", () => renderPng(markdown, opts));
}

async function renderPng(markdown: string, opts: WechatBuildOptions): Promise<Blob> {
  const html = await buildWechatHtml(markdown, opts);
  const holder = document.createElement("div");
  holder.style.cssText =
    "position:fixed;left:-10000px;top:0;width:750px;background:#ffffff;z-index:-1;";
  // buildWechatHtml output is already sanitized by DOMPurify
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
