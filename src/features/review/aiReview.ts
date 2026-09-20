/**
 * 真审核：把正文发给本站的 /api/ai/review，拿回一份 ReviewResult。
 *
 * 只有这一条路——早先那份本地造的假数据已经删掉了：给用户看一堆本地正则编出来的
 * 「意见」，不如明说「还没配模型」。各家的 key 全在服务端，这里只报「用哪家的哪个模型」；
 * 站点没配这家时界面上「开始审核」是灰的，万一还是打过来了，服务端会明确回 no_key / 401 / 403。
 *
 * 纯函数，不认识 React，也不弹提示：错误一律抛出，message 就是能给用户看的一句话。
 */
import type { ReviewResult } from "./types";
import { readAiConfig, type AiConfig } from "./aiConfig";

const REVIEW_API = "/api/ai/review";
const OFFLINE = "现在连不上服务器，稍后再试";

/** 带服务端错误码的失败，界面据此分流（no_key 要引导换一家模型） */
export class AiReviewError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
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
        kind: cfg.kind,
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
 * 界面真正调的那个：按本机此刻的设置（审核类型 / 供应商 / 模型）跑一趟。
 * 设置是在发起这一刻读的，所以在面板里改完再点「重新审核」，用的就是新设置。
 */
export function runReview(content: string, signal?: AbortSignal): Promise<ReviewResult> {
  return requestAiReview(content, readAiConfig(), signal);
}
