"use client";

import { isVideoMime } from "@/lib/media";

/**
 * 媒体上传：优先浏览器直传 OSS，文件不经过本服务，省一次上下行带宽、大文件更快。
 * 图片在 Bucket 没配跨域（或直传被网络拦截）时自动回落到 /api/upload 中转，用户无感；
 * 视频体积大、中转会把整个文件读进内存并撞请求体上限，因此只走直传，失败直接报因。
 */

type Signed = { key: string; uploadUrl: string };

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
async function putDirect(signed: Signed, file: File): Promise<string | null> {
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
    body: JSON.stringify({ key: signed.key }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "文件登记失败");
  return data.url as string;
}

async function viaProxy(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "上传失败");
  return data.url as string;
}

/** 上传一个图片/视频文件，返回可访问 URL；失败抛出带原因的 Error */
export async function uploadMediaFile(file: File): Promise<string> {
  const video = isVideoMime(file.type);
  const signed = await sign(file);
  if (signed) {
    const url = await putDirect(signed, file);
    if (url) return url;
    if (video) {
      throw new Error("视频直传失败：请检查 OSS Bucket 的跨域（CORS）配置是否放行本站 PUT");
    }
  } else if (video) {
    throw new Error("视频上传需要 OSS 直传，服务端未配置阿里云 OSS");
  }
  return viaProxy(file);
}
