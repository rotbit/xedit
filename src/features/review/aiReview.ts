/**
 * The real review: sends the body to this site's /api/ai/review and gets back a ReviewResult.
 *
 * This is the only path; the old locally faked data is gone. Showing users a pile of "comments" made up by local regexes
 * is worse than plainly saying "no model configured yet". The backend decides the model and key; this side only says which types to review.
 * When the backend isn't configured, 「开始审核」 (Start review) is disabled; if a request still gets through, the server replies no_key / 401 / 403 explicitly.
 *
 * Pure functions: no React, no toasts. All errors are thrown, and the message is a sentence fit to show the user.
 */
import type { ReviewRecordMeta, ReviewResult } from "./types";
import { readAiConfig, type AiConfig } from "./aiConfig";
import { t, tk } from "@/i18n/t";

const REVIEW_API = "/api/ai/review";
const OFFLINE = tk("现在连不上服务器，稍后再试");

/** Failure carrying a server error code, used by the UI to branch (no_key means the backend isn't configured yet) */
export class AiReviewError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/** Output of one review run: the result, plus the history record the server saved for it (null if saving failed; comments still show, just can't be revisited) */
export interface ReviewRun {
  result: ReviewResult;
  record: ReviewRecordMeta | null;
}

/** The record in the response is built by the server; only check its shape here, not the details */
export function asRecordMeta(value: unknown): ReviewRecordMeta | null {
  const r = value as Partial<ReviewRecordMeta> | null;
  if (!r || typeof r.id !== "string" || typeof r.createdAt !== "string") return null;
  return {
    id: r.id,
    createdAt: r.createdAt,
    kinds: Array.isArray(r.kinds) ? r.kinds : [],
    model: typeof r.model === "string" ? r.model : "",
    total: typeof r.total === "number" ? r.total : 0,
  };
}

/** Request one real review. Callers must pass a signal so it can be aborted when leaving review or switching documents */
export async function requestAiReview(
  content: string,
  cfg: AiConfig,
  signal?: AbortSignal,
  /** Which document: only with this will the server record the run in history */
  docId?: string
): Promise<ReviewRun> {
  let res: Response;
  try {
    res = await fetch(REVIEW_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        kinds: cfg.kinds,
        docId,
      }),
      signal,
    });
  } catch (e) {
    // Rethrow aborts as-is, otherwise the UI can't tell "user exited review" from "can't reach the server"
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new AiReviewError(OFFLINE, "offline");
  }
  const data = (await res.json().catch(() => null)) as
    | (Partial<ReviewResult> & { error?: unknown; message?: unknown; record?: unknown })
    | null;
  if (!res.ok) {
    const message = typeof data?.message === "string" ? data.message : "";
    const code = typeof data?.error === "string" ? data.error : "failed";
    throw new AiReviewError(message || t("审核失败（{status}）", { status: res.status }), code);
  }
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.categories)) {
    throw new AiReviewError(tk("服务返回的结果看不懂，请再试一次"), "failed");
  }
  return {
    result: {
      summary: typeof data.summary === "string" ? data.summary : "",
      categories: data.categories,
      items: data.items,
    },
    record: asRecordMeta(data.record),
  };
}

/**
 * What the UI actually calls: runs once with the review types currently checked on this device (however many are checked, the server reviews them together into one result).
 * Settings are read at the moment of launch, so changing them in the panel and clicking 「重新审核」 (Review again) uses the new settings.
 */
export function runReview(
  content: string,
  signal?: AbortSignal,
  docId?: string
): Promise<ReviewRun> {
  return requestAiReview(content, readAiConfig(), signal, docId);
}
