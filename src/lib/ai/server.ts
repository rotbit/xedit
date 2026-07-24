import { prisma } from "@/lib/prisma";
import { decryptSecret } from "./crypto";
import { getProvider, providersOf, resolveBaseUrl, type ProviderMeta, type ProviderScope } from "./catalog";

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
 * 读取某用户「文本对话」的 AI 配置（内容审查用）。
 *
 * 平台解析优先级：
 *   1. override.provider —— 本次请求临时指定的平台（前端只能选模型、不能塞密钥；
 *      密钥/接口地址仍以库中该平台记录为准，防越权）。
 *   2. 设置里的默认平台（aiChatProvider）。
 *   3. 回落到首个已填密钥的平台——填了 Key 即可用，无需显式启用。
 * 全部落空返回 null。
 */
export async function getActiveConfig(
  userId: string,
  scope: ProviderScope,
  override?: { provider?: string; model?: string }
): Promise<ActiveConfig | null> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const defaultProvider = settings?.aiChatProvider;
  const overrideProvider =
    override?.provider && getProvider(scope, override.provider) ? override.provider : undefined;

  let providerId = overrideProvider ?? (defaultProvider && getProvider(scope, defaultProvider) ? defaultProvider : undefined);

  // 没有显式默认时，回落到第一个填了密钥的平台
  let rows: Awaited<ReturnType<typeof prisma.aiProvider.findMany>> | null = null;
  if (!providerId) {
    rows = await prisma.aiProvider.findMany({ where: { userId, scope } });
    for (const meta of providersOf(scope)) {
      const r = rows.find((x) => x.provider === meta.id);
      if (r && decryptSecret(r.apiKeyEnc)) {
        providerId = meta.id;
        break;
      }
    }
  }
  if (!providerId) return null;

  const meta = getProvider(scope, providerId);
  if (!meta) return null;
  const row = rows?.find((x) => x.provider === providerId)
    ?? (await prisma.aiProvider.findUnique({
      where: { userId_scope_provider: { userId, scope, provider: providerId } },
    }));
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

