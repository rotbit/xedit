"use client";

import { isVideoMime } from "@/lib/media";
import { t } from "@/i18n/t";

/**
 * Media upload: prefer direct browser upload to OSS so files skip this server, saving a round of bandwidth and speeding up large files.
 * Images fall back to the /api/upload relay automatically when the bucket has no CORS configured (or direct upload is blocked), invisible to the user;
 * videos are large and relaying would read the whole file into memory and hit the request body limit, so they only go direct and failures surface the reason.
 */

type Signed = { key: string; uploadUrl: string };

/** Image pixel dimensions; null if unreadable, in which case those two fields are left out on registration */
export type ImageSize = { width: number; height: number } | null;

/** Wait limit for the <img> fallback decode: a stuck decode must not hold up the upload */
const DECODE_TIMEOUT_MS = 3000;

/** <img> + object URL fallback decode; returns null on timeout / failure / no intrinsic size (some SVGs) */
function readSizeViaImage(file: File): Promise<ImageSize> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    let done = false;
    const finish = (size: ImageSize) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(size);
    };
    const timer = setTimeout(() => finish(null), DECODE_TIMEOUT_MS);
    img.onload = () =>
      finish(
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : null
      );
    img.onerror = () => finish(null);
    img.src = url;
  });
}

/**
 * Read the image's pixel dimensions and register them with the upload, so the image library doesn't have to decode every past image again.
 * createImageBitmap doesn't touch the DOM and is simplest; it's flaky for SVG and old Safari, so fall back to <img> on failure.
 * Videos are skipped (would need the first frame, cost far outweighs benefit); all errors are swallowed and return null, never affecting the upload.
 */
export async function readImageSize(file: File): Promise<ImageSize> {
  if (isVideoMime(file.type)) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size =
      bitmap.width > 0 && bitmap.height > 0
        ? { width: bitmap.width, height: bitmap.height }
        : null;
    bitmap.close();
    if (size) return size;
  } catch {
    /* fall back to <img> below */
  }
  try {
    return await readSizeViaImage(file);
  } catch {
    return null;
  }
}

/** Get a signed URL; returns null when direct upload isn't configured (use the relay), other errors (not signed in / over limit / type) are thrown */
async function sign(file: File): Promise<Signed | null> {
  let res: Response;
  try {
    res = await fetch("/api/upload/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mime: file.type, size: file.size }),
    });
  } catch {
    return null;
  }
  if (res.status === 501 || res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ? t(data.error) : t("上传失败"));
  return data as Signed;
}

/** Upload directly and register; returns null on CORS / network failure, leaving the fallback to the caller */
async function putDirect(signed: Signed, file: File, size: ImageSize): Promise<string | null> {
  try {
    const put = await fetch(signed.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!put.ok) return null;
  } catch {
    return null;
  }
  const res = await fetch("/api/upload/direct", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    // When dimensions are missing, JSON.stringify drops both fields; the server treats them as nullable
    body: JSON.stringify({ key: signed.key, width: size?.width, height: size?.height }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ? t(data.error) : t("文件登记失败"));
  return data.url as string;
}

async function viaProxy(file: File, size: ImageSize): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  if (size) {
    formData.append("width", String(size.width));
    formData.append("height", String(size.height));
  }
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ? t(data.error) : t("上传失败"));
  return data.url as string;
}

/** Upload an image/video file and return an accessible URL; throws an Error with the reason on failure */
export async function uploadMediaFile(file: File): Promise<string> {
  const video = isVideoMime(file.type);
  // Read once, reused by both direct upload and relay
  const size = await readImageSize(file);
  const signed = await sign(file);
  if (signed) {
    const url = await putDirect(signed, file, size);
    if (url) return url;
    if (video) {
      throw new Error(t("视频直传失败：请检查 OSS Bucket 的跨域（CORS）配置是否放行本站 PUT"));
    }
  } else if (video) {
    throw new Error(t("视频上传需要 OSS 直传，服务端未配置阿里云 OSS"));
  }
  return viaProxy(file, size);
}
