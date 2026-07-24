import { prisma } from "@/lib/prisma";
import { ossConfigured, ossPut, IMAGE_EXT } from "@/lib/oss";
import { decryptSecret } from "./crypto";
import { getProvider, resolveBaseUrl, type ProviderMeta, type ProviderScope } from "./catalog";

export interface ActiveConfig {
  meta: ProviderMeta;
  /** 已解密的密钥；未配置时为空串 */
  token: string;
  /** 解析后的接口地址 */
  baseUrl: string;
  /** 选定模型（已回落到平台默认） */
  model: string;
}

/**
 * 读取某用户在指定用途（文本对话 / AI 生图）下启用的 AI 配置。
 * 两个用途各有一套平台、密钥与模型；未启用/无该平台记录时返回 null。
 *
 * override 用于「编辑器里临时切换」：调用方指定本次要用的平台与模型，
 * 覆盖设置里的默认。为防越权，仍以数据库中该平台自己的密钥/接口地址为准，
 * 前端只能选模型、不能塞密钥；平台 id 非法时忽略 override 回落默认。
 */
export async function getActiveConfig(
  userId: string,
  scope: ProviderScope,
  override?: { provider?: string; model?: string }
): Promise<ActiveConfig | null> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const defaultProvider = scope === "chat" ? settings?.aiChatProvider : settings?.aiImageProvider;
  const overrideProvider =
    override?.provider && getProvider(scope, override.provider) ? override.provider : undefined;
  const providerId = overrideProvider ?? defaultProvider;
  if (!providerId) return null;
  const meta = getProvider(scope, providerId);
  if (!meta) return null;
  const row = await prisma.aiProvider.findUnique({
    where: { userId_scope_provider: { userId, scope, provider: providerId } },
  });
  if (!row) return null;
  // 只有确实切到了这个平台，才采用前端传来的模型；否则用该平台自己存的模型
  const model = (overrideProvider && override?.model?.trim()) || row.model || meta.defaultModel;
  return {
    meta,
    token: decryptSecret(row.apiKeyEnc),
    baseUrl: resolveBaseUrl(meta, row.baseUrl),
    model,
  };
}

/**
 * 把生成的图片落到 OSS 图床并登记 Asset，返回可访问 URL。
 * - 传 b64：直接转存；未配置 OSS 时抛错（base64 无法直接给公众号用）。
 * - 传 url：优先转存图床（Replicate/智谱返回的都是临时地址）；未配置 OSS 时原样返回。
 */
export async function persistImage(
  userId: string,
  opts: { url?: string; b64?: string }
): Promise<string> {
  let buffer: Buffer | null = null;
  let mime = "image/png";

  if (opts.b64) {
    buffer = Buffer.from(opts.b64, "base64");
  } else if (opts.url) {
    if (!ossConfigured()) return opts.url;
    const res = await fetch(opts.url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`下载生成的图片失败（${res.status}）`);
    mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    buffer = Buffer.from(await res.arrayBuffer());
  }

  if (!buffer) throw new Error("AI 未返回图片");

  if (!ossConfigured()) {
    throw new Error("该模型返回 base64 图片，需要配置阿里云 OSS 图床后才能使用");
  }

  const ext = IMAGE_EXT[mime] ?? "png";
  const { url, key } = await ossPut(buffer, ext, mime);
  await prisma.asset.create({
    data: { userId, key, url, size: buffer.length, mime, source: "ai" },
  });
  return url;
}
