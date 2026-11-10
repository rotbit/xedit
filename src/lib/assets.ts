import { prisma } from "@/lib/prisma";
import { uploadBlocked } from "@/lib/guards";
import { ossConfigured, ossDelete, ossPut } from "@/lib/oss";
import {
  IMAGE_EXT,
  VIDEO_EXT,
  MEDIA_EXT,
  maxSizeOf,
  sizeLimitError,
} from "@/lib/media";
import { tk } from "@/i18n/t";
import { prepareImage } from "@/lib/imagePrivacy";
import { reserveUpload, finishUpload, cancelServerUpload, uploadCanBeDeleted, UploadError } from "@/lib/uploadReservations";
import { publicFetch } from "@/lib/publicFetch";
import { readLimitedBody } from "@/lib/security/requestBody";

/**
 * Shared service layer for media assets (images/videos), used by MCP tools. Reuses the OSS logic in src/lib/oss.ts,
 * with every operation scoped by userId. upload-from-URL has an SSRF guard.
 */

export type MediaKind = "image" | "video";

/** Validate mime per tool semantics: upload_image only accepts images, upload_video only videos */
function assertKind(mime: string, kind: MediaKind): void {
  const table = kind === "video" ? VIDEO_EXT : IMAGE_EXT;
  if (!Object.hasOwn(table, mime)) {
    const hint = kind === "video" ? "mp4/webm/mov" : "png/jpg/gif/webp/svg";
    throw new Error(`不支持的${kind === "video" ? "视频" : "图片"}类型: ${mime || "未知"}（支持 ${hint}）`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  }
}

export interface AssetView {
  id: string;
  url: string;
  mime: string;
  size: number;
  source: string;
  /** Pixel dimensions; the server upload path can't read them, so null, filled in by the frontend on first display */
  width: number | null;
  height: number | null;
  createdAt: Date;
}

function toView(a: {
  id: string;
  url: string;
  mime: string;
  size: number;
  source: string;
  width: number | null;
  height: number | null;
  createdAt: Date;
}): AssetView {
  return {
    id: a.id,
    url: a.url,
    mime: a.mime,
    size: a.size,
    source: a.source,
    width: a.width,
    height: a.height,
    createdAt: a.createdAt,
  };
}

function clampLimit(v: number | undefined, def: number, max: number): number {
  if (!v || !Number.isFinite(v)) return def;
  return Math.min(Math.max(Math.floor(v), 1), max);
}

export async function listImages(userId: string, limit?: number): Promise<AssetView[]> {
  const rows = await prisma.asset.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: clampLimit(limit, 50, 200),
  });
  return rows.map(toView);
}

export async function getImage(
  userId: string,
  id: string
): Promise<(AssetView & { key: string }) | null> {
  const a = await prisma.asset.findFirst({ where: { id, userId } });
  return a ? { ...toView(a), key: a.key } : null;
}

export async function deleteImage(userId: string, id: string): Promise<boolean> {
  const a = await prisma.asset.findFirst({ where: { id, userId } });
  if (!a) return false;
  if (!uploadCanBeDeleted(a)) throw new UploadError(tk("上传刚完成，请五分钟后再删除"), 409);
  if (ossConfigured()) {
    try {
      await ossDelete(a.key);
    } catch {
      // Keep both the index and quota charged until storage deletion succeeds.
      throw new UploadError(tk("删除失败，请稍后重试"), 502);
    }
  }
  await prisma.asset.delete({ where: { id: a.id } });
  return true;
}

/** Direct persistence entry when the server already holds the bytes (MCP base64, Feishu import, etc. all funnel here) */
export async function uploadMediaBuffer(
  userId: string,
  buffer: Buffer,
  mime: string,
  source: string
): Promise<AssetView> {
  if (!Object.hasOwn(MEDIA_EXT, mime)) throw new UploadError(tk("不支持的图片内容"));
  if (buffer.length === 0) throw new UploadError(tk("空文件"));
  if (buffer.length > maxSizeOf(mime)) throw new UploadError(sizeLimitError(mime), 413);
  if (!ossConfigured()) throw new UploadError(tk("服务端未配置阿里云 OSS，无法上传"), 501);
  let media;
  try { media = await prepareImage(buffer, mime); }
  catch { throw new UploadError(tk("无法处理图片，请检查格式和尺寸")); }
  const reserved = await reserveUpload(userId, media.mime, media.buffer.length);
  try {
    await ossPut(media.buffer, MEDIA_EXT[media.mime], media.mime, reserved.key);
    return toView(await finishUpload(userId, reserved.key, media.buffer.length, media.mime, source));
  } catch (error) {
    await cancelServerUpload(userId, reserved.key).catch(() => {});
    if (error instanceof UploadError) throw error;
    throw new UploadError(tk("上传失败，请稍后重试"), 502);
  }
}

export async function uploadMediaFromBase64(
  userId: string,
  data: string,
  mime: string | undefined,
  kind: MediaKind
): Promise<AssetView> {
  // Supports data URLs (data:image/png;base64,xxxx), which carry the mime
  const m = data.match(/^data:([^;,]*);base64,([\s\S]*)$/);
  const finalMime = mime || (m ? m[1] : "");
  assertKind(finalMime, kind);
  const b64 = m ? m[2] : data;
  if (b64.length > Math.ceil(maxSizeOf(finalMime) / 3) * 4) throw new UploadError(sizeLimitError(finalMime), 413);
  const buffer = Buffer.from(b64, "base64");
  return uploadMediaBuffer(userId, buffer, finalMime, "mcp");
}

export async function uploadMediaFromUrl(
  userId: string,
  sourceUrl: string,
  kind: MediaKind
): Promise<AssetView> {
  // Rough check before downloading: a banned or over-quota account will never be able to write, so don't pull dozens of MB
  // into memory just to reject it. The size is unknown here, so passing 0 only checks "banned / already over quota";
  // the exact check against the real size is still done by the uploadBlocked call inside uploadMediaBuffer below
  const blocked = await uploadBlocked(userId, 0);
  if (blocked) throw new Error(blocked);
  // Videos are large, so the fetch window is wider (the MCP route's overall cap is 60s)
  const res = await publicFetch(sourceUrl, kind === "video" ? 45000 : 15000);
  if (!res.ok) throw new Error(`抓取失败: HTTP ${res.status}`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  const mime = (res.headers.get("content-type") || "").split(";")[0].trim();
  assertKind(mime, kind);
  const limit = maxSizeOf(mime);
  const declared = Number(res.headers.get("content-length") || 0);
  // Reject outright if the declared size is over the limit; no need to read the body
  if (declared && declared > limit) throw new Error(sizeLimitError(mime));
  const buffer = await readLimitedBody(res.body, limit);
  return uploadMediaBuffer(userId, buffer, mime, "mcp-url");
}
