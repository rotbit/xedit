/**
 * 真审核：把正文发给本站的 /api/ai/review，拿回一份 ReviewResult。
 *
 * 没填 key 也没登录时不发请求，直接回退到 mockReview——原型那套假数据还留着，
 * 它是「没配 AI 也能看见这个功能长什么样」的演示路径，也是单测里的确定性样本。
 *
 * 纯函数，不认识 React，也不弹提示：错误一律抛出，message 就是能给用户看的一句话。
 */
import type { ReviewResult } from "./types";
import { aiKeyOf, readAiConfig, type AiConfig } from "./aiConfig";
import { mockReview } from "./mockReview";

const REVIEW_API = "/api/ai/review";
const OFFLINE = "现在连不上服务器，稍后再试";

/** 带服务端错误码的失败，界面据此分流（no_key 要引导去填 key，bad_key 要说 key 不对） */
export class AiReviewError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/**
 * 这一趟走真模型还是走假数据。
 * 用户填了 key 就走真的；没填也允许试一次——站点可能自己配了 key（只对管理员开放），
 * 服务端会明确回 no_key / 401 / 403，那时候界面再提示怎么配，比闷声给假数据诚实。
 */
export function aiReviewConfigured(cfg: AiConfig = readAiConfig()): boolean {
  return aiKeyOf(cfg) !== "";
}

/** 请求一次真审核。调用方务必传 signal：退出审核 / 换文档时要能把它掐掉 */
export async function requestAiReview(
  content: string,
  cfg: AiConfig,
  signal?: AbortSignal
): Promise<ReviewResult> {
  let res: Response;
  try {
    res = await fetch(REVIEW_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        provider: cfg.provider,
        model: cfg.model,
        // 没填就不发这个字段：服务端据此走「站点自带 key」那条路
        ...(aiKeyOf(cfg) ? { apiKey: aiKeyOf(cfg) } : {}),
      }),
      signal,
    });
  } catch (e) {
    // abort 原样往上抛，否则界面分不清「用户退出了审核」和「连不上服务器」
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new AiReviewError(OFFLINE, "offline");
  }
  const data = (await res.json().catch(() => null)) as
    | (Partial<ReviewResult> & { error?: unknown; message?: unknown })
    | null;
  if (!res.ok) {
    const message = typeof data?.message === "string" ? data.message : "";
    const code = typeof data?.error === "string" ? data.error : "failed";
    throw new AiReviewError(message || `审核失败（${res.status}）`, code);
  }
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.categories)) {
    throw new AiReviewError("服务返回的结果看不懂，请再试一次", "failed");
  }
  return {
    summary: typeof data.summary === "string" ? data.summary : "",
    categories: data.categories,
    items: data.items,
  };
}

/**
 * 界面真正调的那个：配了就走模型，没配就走假数据。
 * 两条路返回同一个形状，上层（useReview）不必知道这次是真是假。
 */
export function runReview(content: string, signal?: AbortSignal): Promise<ReviewResult> {
  const cfg = readAiConfig();
  if (!aiReviewConfigured(cfg)) return mockReview(content);
  return requestAiReview(content, cfg, signal);
}
