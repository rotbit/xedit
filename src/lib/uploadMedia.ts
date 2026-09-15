"use client";

import { isVideoMime } from "@/lib/media";

/**
 * 媒体上传：优先浏览器直传 OSS，文件不经过本服务，省一次上下行带宽、大文件更快。
 * 图片在 Bucket 没配跨域（或直传被网络拦截）时自动回落到 /api/upload 中转，用户无感；
 * 视频体积大、中转会把整个文件读进内存并撞请求体上限，因此只走直传，失败直接报因。
 */

type Signed = { key: string; uploadUrl: string };

/** 图片像素尺寸；读不出就是 null，登记时不带这两个字段 */
export type ImageSize = { width: number; height: number } | null;

/** <img> 兜底解码的等待上限：解码卡住不能拖住上传主流程 */
const DECODE_TIMEOUT_MS = 3000;

/** <img> + object URL 兜底解码；超时/失败/无内在尺寸（部分 SVG）都返回 null */
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
 * 读出图片的像素尺寸，随上传一起登记，省得图片库为每张历史图再解一次。
 * createImageBitmap 不碰 DOM、最省事；它对 SVG 与老 Safari 不稳，失败退 <img>。
 * 视频不读（要拉首帧，代价远大于收益）；任何异常都吞掉返回 null，绝不影响上传。
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
    /* 下面退 <img> */
  }
  try {
    return await readSizeViaImage(file);
  } catch {
    return null;
  }
}

/** 换签名地址；未配置直传返回 null 走中转，其余错误（未登录/超限/类型）直接抛出 */
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
  if (!res.ok) throw new Error(data.error ?? "上传失败");
  return data as Signed;
}

/** 直传并登记；跨域/网络失败返回 null 交给调用方决定兜底 */
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
    // 尺寸缺失时两个字段会被 JSON.stringify 丢掉，服务端按可空处理
    body: JSON.stringify({ key: signed.key, width: size?.width, height: size?.height }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "文件登记失败");
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
  if (!res.ok) throw new Error(data.error ?? "上传失败");
  return data.url as string;
}

/** 上传一个图片/视频文件，返回可访问 URL；失败抛出带原因的 Error */
export async function uploadMediaFile(file: File): Promise<string> {
  const video = isVideoMime(file.type);
  // 只读一次，直传与中转两条路都复用
  const size = await readImageSize(file);
  const signed = await sign(file);
  if (signed) {
    const url = await putDirect(signed, file, size);
    if (url) return url;
    if (video) {
      throw new Error("视频直传失败：请检查 OSS Bucket 的跨域（CORS）配置是否放行本站 PUT");
    }
  } else if (video) {
    throw new Error("视频上传需要 OSS 直传，服务端未配置阿里云 OSS");
  }
  return viaProxy(file, size);
}
