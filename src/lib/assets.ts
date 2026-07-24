import { lookup } from "node:dns/promises";
import net from "node:net";
import { prisma } from "@/lib/prisma";
import {
  IMAGE_EXT,
  MAX_IMAGE_SIZE,
  ossConfigured,
  ossDelete,
  ossPut,
} from "@/lib/oss";

/**
 * 图片资产的共享服务层（供 MCP 工具用）。复用 src/lib/oss.ts 的 OSS 逻辑，
 * 所有操作按 userId 隔离。upload-from-URL 带 SSRF 守卫。
 */

export interface AssetView {
  id: string;
  url: string;
  mime: string;
  size: number;
  source: string;
  createdAt: Date;
}

function toView(a: {
  id: string;
  url: string;
  mime: string;
  size: number;
  source: string;
  createdAt: Date;
}): AssetView {
  return { id: a.id, url: a.url, mime: a.mime, size: a.size, source: a.source, createdAt: a.createdAt };
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
    // OSS 删除失败不阻断索引清理（对象可能已不存在），与 REST 行为一致
    try {
      await ossDelete(a.key);
    } catch {
      /* ignore */
    }
  }
  await prisma.asset.delete({ where: { id: a.id } });
  return true;
}

async function storeBuffer(
  userId: string,
  buffer: Buffer,
  mime: string,
  source: string
): Promise<AssetView> {
  const ext = IMAGE_EXT[mime];
  if (!ext) throw new Error(`不支持的图片类型: ${mime || "未知"}`);
  if (buffer.length === 0) throw new Error("空文件");
  if (buffer.length > MAX_IMAGE_SIZE) throw new Error("图片不能超过 10MB");
  if (!ossConfigured()) throw new Error("服务端未配置阿里云 OSS，无法上传");
  const { url, key } = await ossPut(buffer, ext, mime);
  const a = await prisma.asset.create({
    data: { userId, key, url, size: buffer.length, mime, source },
  });
  return toView(a);
}

export async function uploadImageFromBase64(
  userId: string,
  data: string,
  mime?: string
): Promise<AssetView> {
  // 兼容 data URL（data:image/png;base64,xxxx），可从中取 mime
  const m = data.match(/^data:([^;,]*);base64,([\s\S]*)$/);
  const finalMime = mime || (m ? m[1] : "");
  const b64 = m ? m[2] : data;
  const buffer = Buffer.from(b64, "base64");
  return storeBuffer(userId, buffer, finalMime, "mcp");
}

// ---- SSRF 守卫：upload-from-URL 是服务端抓取用户给的地址，必须挡内网/保留段 ----

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + 云元数据 169.254.169.254
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
    throw new Error("非法的图片 URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 http/https 图片地址");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, ""); // 去掉 IPv6 方括号
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new Error("禁止访问内网 / 保留地址");
  }
}

/** 逐跳校验的安全抓取：手动跟随重定向，每一跳都过 SSRF 守卫，防重定向绕过 */
async function safeImageFetch(url: string): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    await assertPublicHttpUrl(current);
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("重定向缺少 Location");
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("重定向次数过多");
}

export async function uploadImageFromUrl(userId: string, sourceUrl: string): Promise<AssetView> {
  const res = await safeImageFetch(sourceUrl);
  if (!res.ok) throw new Error(`抓取图片失败: HTTP ${res.status}`);
  const mime = (res.headers.get("content-type") || "").split(";")[0].trim();
  if (!IMAGE_EXT[mime]) throw new Error(`该地址不是支持的图片类型: ${mime || "未知"}`);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared && declared > MAX_IMAGE_SIZE) throw new Error("图片不能超过 10MB");
  const buffer = Buffer.from(await res.arrayBuffer());
  return storeBuffer(userId, buffer, mime, "mcp-url");
}
