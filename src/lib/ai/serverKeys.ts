/**
 * 站点自带的 AI key（服务端专用）。
 *
 * 两种来路：用户在设置里填自己的 key，或者用站点配在环境变量里的那份。
 * 用户自带优先——花自己的钱，想用哪家用哪家；站点这份只是给「没 key 也想试一下」的人兜底，
 * 所以哪几家配了要能被 /api/config 报出来，网页才好决定面板上提不提示「必须填 key」。
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
