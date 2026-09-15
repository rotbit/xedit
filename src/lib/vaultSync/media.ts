"use client";

/**
 * 同步时的附件换算：本地文件里图片写的是相对路径（attachments/xxx.png），云端要的是图床 url。
 * 上云时把没传过的附件传一次并记进索引（idx.images），下回同一张图直接换成 url；
 * 写回本地时按反向表把 url 换回相对路径 —— 所以磁盘上的文件永远是相对路径，
 * 用 Obsidian 打开照样显示，图床只是云端那一份的事。
 * 上传失败、文件不在库里都只影响这一条引用（保持原样，下轮再试），绝不打断整轮同步。
 */

import { IMAGE_REF, isAttachmentSrc, toAttachmentRel } from "@/lib/localBackend/attachmentUrls";
import type { VaultBackend } from "@/lib/localBackend/vaultBackend";
import { baseName } from "@/lib/localBackend/vaultFs";
import { uploadMediaFile } from "@/lib/uploadMedia";
import type { SyncIndex } from "./index";

export interface ToCloudResult {
  content: string;
  /** 本次真传上去的附件数（索引有新条目要落盘） */
  uploaded: number;
  /** 传失败的附件数：正文里那条引用保持相对路径 */
  failed: number;
}

/** 扩展名兜底的 MIME：磁盘上的 File 一般自带 type，个别格式给的是空串 */
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/** 本地正文 → 云端正文：库内附件换成图床 url（视频同理，uploadMediaFile 自己走直传） */
export async function toCloudContent(
  vault: VaultBackend,
  content: string,
  idx: SyncIndex
): Promise<ToCloudResult> {
  const refs = new Set<string>();
  for (const m of content.matchAll(IMAGE_REF)) if (isAttachmentSrc(m[1])) refs.add(m[1]);
  if (refs.size === 0) return { content, uploaded: 0, failed: 0 };
  const urlBySrc = new Map<string, string>();
  let uploaded = 0;
  let failed = 0;
  for (const src of refs) {
    const rel = toAttachmentRel(src);
    const known = idx.images[rel];
    if (known) {
      urlBySrc.set(src, known);
      continue;
    }
    const { url, missing } = await uploadAttachment(vault, rel);
    if (!url) {
      // 文件不在库里就当没这张图（保持原样）；真失败的记一笔，下轮再传
      if (!missing) failed++;
      continue;
    }
    idx.images[rel] = url;
    urlBySrc.set(src, url);
    uploaded++;
  }
  return { content: replaceSrc(content, urlBySrc), uploaded, failed };
}

/** 云端正文 → 本地正文：认得的图床 url 换回相对路径，不在表里的原样留着（v1 不下载远端图片） */
export function toLocalContent(content: string, idx: SyncIndex): string {
  const relByUrl = new Map<string, string>();
  for (const [rel, url] of Object.entries(idx.images)) relByUrl.set(url, rel);
  if (relByUrl.size === 0) return content;
  return replaceSrc(content, relByUrl);
}

/** 传一个库内附件到图床：missing 表示文件不在库里（不算失败）；url 为 null 即上传失败 */
async function uploadAttachment(
  vault: VaultBackend,
  rel: string
): Promise<{ url: string | null; missing: boolean }> {
  const objectUrl = await vault.getAttachmentUrl(rel).catch(() => null);
  if (!objectUrl) return { url: null, missing: true };
  try {
    const blob = await fetch(objectUrl).then((r) => r.blob());
    const name = fileName(rel);
    const type = blob.type || MIME[extOf(name)] || "application/octet-stream";
    return { url: await uploadMediaFile(new File([blob], name, { type })), missing: false };
  } catch {
    // 超限 / 离线 / 未登录：这张图这轮先算了
    return { url: null, missing: false };
  }
}

/** 只换 src 那一段，alt 与尖括号写法原样留着（与 inlineAttachments 同一套替换规则） */
function replaceSrc(content: string, next: Map<string, string>): string {
  return content.replace(IMAGE_REF, (whole, src: string) => {
    const to = next.get(src);
    return to ? whole.slice(0, whole.length - src.length) + to : whole;
  });
}

/** 正文里的路径可能是 %20 转义过的，上传用的文件名解码回来更好看 */
function fileName(rel: string): string {
  const name = baseName(rel);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

const extOf = (name: string): string => (/\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1] ?? "").toLowerCase();
