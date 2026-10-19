// Word export · media preparation: fetch image bytes concurrently, grab video poster frames, rasterize formula SVGs, so the later tree walk can read them synchronously.

import type { Build, PreparedImage } from "./types";

// -- Media preparation: fetch all image bytes concurrently so the later tree walk can stay synchronous --

async function fetchBlob(url: string): Promise<Blob | null> {
  if (url.startsWith("data:")) {
    try {
      return await (await fetch(url)).blob();
    } catch {
      return null;
    }
  }
  // Direct fetch first; fall back to the same-origin proxy when the image host lacks CORS
  try {
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) return await res.blob();
  } catch {
    /* Blocked cross-origin; use the proxy */
  }
  try {
    const res = await fetch(`/api/export/media?url=${encodeURIComponent(url)}`);
    if (res.ok) return await res.blob();
  } catch {
    /* Proxy failed too; treat as a missing image */
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

/** Convert to PNG via canvas (formats Word doesn't support like webp/svg, plus high-res upscaling for formulas) */
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
      /* Decode failed; fall back to canvas */
    }
  }
  return rasterizeToPng(blob, 1);
}

/** Grab the first video frame as the poster: requires the video source to allow cross-origin reads (our OSS has CORS for direct uploads); on failure or timeout, degrade to no poster */
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
      // Skip the all-black frame 0 and take 0.1s (short videos fall back to the midpoint)
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
        done(null); // Without CORS on the source, the canvas is tainted and drawImage/toBlob throw
      }
    };
    v.src = src;
  });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
  return Promise.race([capture, timeout]);
}

/** Leading whitespace after a line break isn't rendered in browsers (markdown-it emits <br>\n), so strip it before export to match */
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
  // Video poster: prefer poster (already fetched with the image batch), otherwise grab the first frame on the spot
  await Promise.all(
    Array.from(root.querySelectorAll("video")).map(async (v) => {
      const poster = v.getAttribute("poster");
      const fromPoster = poster ? (b.images.get(poster) ?? null) : null;
      const src = v.getAttribute("src") ?? "";
      b.frames.set(v, fromPoster ?? (src ? await captureVideoFrame(src) : null));
    })
  );
  // Formulas: rasterize MathJax SVG to 2x PNG; without SVG (MathJax not ready) leave null and fall back to TeX text
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
