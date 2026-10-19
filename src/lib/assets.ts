import { lookup } from "node:dns/promises";
import net from "node:net";
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

/**
 * Shared service layer for media assets (images/videos), used by MCP tools. Reuses the OSS logic in src/lib/oss.ts,
 * with every operation scoped by userId. upload-from-URL has an SSRF guard.
 */

export type MediaKind = "image" | "video";

/** Validate mime per tool semantics: upload_image only accepts images, upload_video only videos */
function assertKind(mime: string, kind: MediaKind): void {
  const table = kind === "video" ? VIDEO_EXT : IMAGE_EXT;
  if (!(mime in table)) {
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
  if (ossConfigured()) {
    // An OSS delete failure doesn't block index cleanup (the object may already be gone), same as the REST behavior
    try {
      await ossDelete(a.key);
    } catch {
      /* ignore */
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
  const ext = MEDIA_EXT[mime];
  if (!ext) throw new Error(`不支持的文件类型: ${mime || "未知"}`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  if (buffer.length === 0) throw new Error(tk("空文件"));
  if (buffer.length > maxSizeOf(mime)) throw new Error(sizeLimitError(mime));
  if (!ossConfigured()) throw new Error(tk("服务端未配置阿里云 OSS，无法上传"));
  // Read-only ban / storage quota: both MCP upload paths funnel here
  const blocked = await uploadBlocked(userId, buffer.length);
  if (blocked) throw new Error(blocked);
  const { url, key } = await ossPut(buffer, ext, mime);
  // Don't decode to get pixel dimensions (the server would need another image library just to save the frontend one decode); leave empty for the frontend to fill in
  const a = await prisma.asset.create({
    data: { userId, key, url, size: buffer.length, mime, source },
  });
  return toView(a);
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
  const buffer = Buffer.from(b64, "base64");
  return uploadMediaBuffer(userId, buffer, finalMime, "mcp");
}

// ---- SSRF guard: upload-from-URL fetches a user-supplied address server-side, so internal/reserved ranges must be blocked ----

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::") return true;
  if (low.startsWith("::ffff:")) return isPrivateIp(low.slice(7)); // v4-mapped
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // ULA
  if (low.startsWith("fe80")) return true; // link-local
  return false;
}

async function assertPublicHttpUrl(u: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    throw new Error(tk("非法的图片 URL"));
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(tk("仅支持 http/https 图片地址"));
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, ""); // Strip IPv6 brackets
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new Error(tk("禁止访问内网 / 保留地址"));
  }
}

/** Safe fetch validated hop by hop: follow redirects manually, running each hop through the SSRF guard to prevent redirect bypasses */
async function safeMediaFetch(url: string, timeoutMs: number): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    await assertPublicHttpUrl(current);
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(tk("重定向缺少 Location"));
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error(tk("重定向次数过多"));
}

/**
 * Read the response body as a stream up to the limit. content-length can be missing or lie, so trusting it is as good as nothing;
 * instead count as we read and cancel the connection once over -- otherwise arrayBuffer() would read the whole oversized response
 * into memory before deciding it's "too big", by which point the memory is already spent.
 */
async function readBodyWithLimit(res: Response, maxBytes: number, mime: string): Promise<Buffer> {
  if (!res.body) throw new Error(tk("抓取失败: 响应没有内容"));
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(sizeLimitError(mime));
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
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
  const res = await safeMediaFetch(sourceUrl, kind === "video" ? 45000 : 15000);
  if (!res.ok) throw new Error(`抓取失败: HTTP ${res.status}`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  const mime = (res.headers.get("content-type") || "").split(";")[0].trim();
  assertKind(mime, kind);
  const limit = maxSizeOf(mime);
  const declared = Number(res.headers.get("content-length") || 0);
  // Reject outright if the declared size is over the limit; no need to read the body
  if (declared && declared > limit) throw new Error(sizeLimitError(mime));
  const buffer = await readBodyWithLimit(res, limit, mime);
  return uploadMediaBuffer(userId, buffer, mime, "mcp-url");
}
