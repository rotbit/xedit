// 导出 Word · 媒体准备：并发拉取图片字节、抓取视频封面帧、栅格化公式 SVG，供后续树遍历同步取用。

import type { Build, PreparedImage } from "./types";

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

/** 换行后的行首空白在浏览器里不渲染（markdown-it 输出 <br>\n），导出前抹掉保持一致 */
export function stripSpaceAfterBreaks(root: HTMLElement): void {
  root.querySelectorAll("br").forEach((br) => {
    let node = br.nextSibling;
    while (node && node.nodeType === Node.TEXT_NODE) {
      node.textContent = (node.textContent ?? "").replace(/^\s+/, "");
      if (node.textContent) break;
      const next = node.nextSibling;
      node.parentNode?.removeChild(node);
      node = next;
    }
  });
}

export async function prepareMedia(root: HTMLElement, b: Build): Promise<void> {
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
