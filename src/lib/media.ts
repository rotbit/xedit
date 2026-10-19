/**
 * Image hosting media type allowlist and helpers (client-safe, no ali-oss dependency).
 * Images: direct upload with /api/upload relay as fallback; videos: browser direct upload only (the relay would read the whole file into memory).
 */

import { t } from "@/i18n/t";

/** Allowed image types → extension */
export const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** Allowed video types → extension (the three that browsers play and WeChat commonly uses) */
export const VIDEO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const MEDIA_EXT: Record<string, string> = { ...IMAGE_EXT, ...VIDEO_EXT };

/** Max size per image */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
/** Max size per video */
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

export function isVideoMime(mime: string): boolean {
  return mime in VIDEO_EXT;
}

/** Strip the trailing extension from a filename: image/video captions inserted into the body shouldn't include `.png` */
export function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/**
 * Alt text for an inserted image (shown as a caption in preview and WeChat), derived from the filename.
 * Browsers name every pasted screenshot image.png; such placeholder names aren't the author's caption and shouldn't become an "image" caption line.
 */
export function altFromFileName(name: string): string {
  const base = stripExt(name).trim();
  // Placeholder name + optional number: image1 / img_3 / screenshot-2 / image (2)
  return /^(image|img|blob|screenshot|截图|图片|未命名)\s*[-_]?\s*(\(\d+\)|\d+)?$/i.test(base) ? "" : base;
}

export function maxSizeOf(mime: string): number {
  return isVideoMime(mime) ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
}

/** Over-limit messages: plain-language copy for image vs video (server-side t() falls back to Chinese, which is exactly the API message key) */
export function sizeLimitError(mime: string): string {
  return isVideoMime(mime) ? t("视频不能超过 100MB") : t("图片不能超过 10MB");
}

/** Infer mime from extension (OSS history sync and direct-upload registration only have the object key) */
export const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/** Pixel dimension cap: anything larger is basically junk or forged; better not to record it at all */
const MAX_IMAGE_DIMENSION = 20000;

/** A single dimension: accepts a number or numeric string; valid only as a positive integer within the cap, else null */
function parseDimension(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isInteger(n) || n <= 0 || n > MAX_IMAGE_DIMENSION) return null;
  return n;
}

/**
 * Parse the image pixel dimensions reported by the client (shared by upload registration and backfill endpoints).
 * Width and height only mean something as a pair; if either is invalid ignore both. Dimensions are an optional display optimization and shouldn't fail an upload.
 */
export function parseImageDimensions(
  width: unknown,
  height: unknown
): { width: number; height: number } | null {
  const w = parseDimension(width);
  const h = parseDimension(height);
  return w !== null && h !== null ? { width: w, height: h } : null;
}

/** Whether the URL points to a video (by extension, tolerating query strings and hashes) */
const VIDEO_URL_RE = /\.(mp4|webm|mov|m4v)(?:$|[?#])/i;

export function isVideoUrl(url: string): boolean {
  return VIDEO_URL_RE.test(url);
}

/**
 * Convention for carrying a video's poster frame: put it in the image syntax's title slot.
 *   ![caption](https://…/video.mp4 "poster=https://…/cover.jpg")
 * At render time a title starting with poster= becomes <video poster> instead of a plain title.
 */
export function posterFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const m = title.match(/^poster=(https?:\/\/\S+)$/);
  return m ? m[1] : null;
}
