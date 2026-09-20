/**
 * 各家 AI 的 key（服务端专用）。
 *
 * key 只有这一个来路：配在服务端环境变量里。网页不收、不存、不传任何 key，只选模型；
 * 哪几家配了由 /api/config 报出去（只报 id，不报 key），网页据此决定哪家能选。
 *
 * 这个模块只许在服务端加载：网页侧打包后 process.env 读不到这些名字（Next 只内联 NEXT_PUBLIC_*），
 * 拿到的会是一串 undefined，比报错更难查。
 */
import { AI_PROVIDERS, type AiProvider, type AiProviderId } from "./providers";

/** 站点为这家配的 key；没配返回空串 */
export function siteAiKey(provider: AiProvider): string {
  return process.env[provider.envKey]?.trim() ?? "";
}

/** 站点配了 key 的那几家，/api/config 用它告诉网页 */
export function siteAiProviders(): AiProviderId[] {
  return AI_PROVIDERS.filter((p) => siteAiKey(p) !== "").map((p) => p.id);
}
