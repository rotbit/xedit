import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AiError, chatComplete } from "@/lib/ai/chat";
import { aiProvider } from "@/lib/ai/providers";
import { DEFAULT_REVIEW_KIND, cleanReviewKinds, isReviewKind } from "@/lib/ai/reviewKinds";
import {
  buildReviewUserPrompt,
  clipForReview,
  mergeReviewResults,
  parseReviewResult,
  reviewSystemPrompt,
  type ReviewPart,
} from "@/lib/ai/reviewPrompt";
import { cleanDocId, saveReviewRecord } from "@/lib/ai/reviewHistory";
import { getReviewGuide, getReviewModel, siteAiKey } from "@/lib/ai/siteSettings";
import { aiLimiter, aiDailyLimit } from "@/lib/ai/limit";
import { requirePermission } from "@/lib/permissions";
import { tk, translate } from "@/i18n/t";
import { localeOfRequest } from "@/i18n/server";

/**
 * AI article review: body in, one ReviewResult out (shape in features/review/types).
 *
 * Which provider's model, which key and how prompts are written are all set in admin (see lib/ai/siteSettings, env vars as fallback).
 * The request body only accepts the body text and review kinds (several can be checked at once, each runs its own prompt, merged into one result); provider / model / key are ignored if sent.
 * It spends the site's money, same rule as AI cover generation: must be logged in with ai_review permission (see lib/permissions,
 * admins have it built in), plus a per-account limit: an account-specific limit set in admin if any, otherwise the global default.
 *
 * If the request includes a docId, a history entry is saved after success (see lib/ai/reviewHistory) and the response gains a record;
 * failing to save isn't a review failure: the suggestions are still returned, just not reviewable later.
 */

/** Request body cap: the body side truncates to 24k chars itself, so this leaves ample headroom; more than this is someone flooding */
const MAX_BODY_BYTES = 512 * 1024;

/** Error code → HTTP status; anything unlisted (assorted upstream issues) is 502 */
const STATUS: Partial<Record<string, number>> = {
  no_key: 503,
  bad_key: 401,
  bad_input: 400,
  rate_limited: 429,
  timeout: 504,
};

interface Body {
  content?: unknown;
  /** Which kinds to review (wording / WeChat rules, multi-select); see lib/ai/reviewKinds */
  kinds?: unknown;
  /** Single-select era field, still used by old web clients; if neither is given, review wording */
  kind?: unknown;
  /** Which article: history is recorded only if given */
  docId?: unknown;
}

export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return tooLarge();

  let body: Body = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") body = parsed as Body;
  } catch {}

  // Absent means an old web client or a third party is calling, so review wording; anything given but unrecognized is rejected:
  // silently switching to another review kind would give the user suggestions that miss the point
  const asked: unknown[] = Array.isArray(body.kinds)
    ? body.kinds
    : [body.kind === undefined ? DEFAULT_REVIEW_KIND : body.kind];
  if (asked.length === 0 || !asked.every(isReviewKind)) return bad(tk("认不出这个审核类型"));
  const kinds = cleanReviewKinds(asked);
  const content = typeof body.content === "string" ? body.content : "";
  if (content.trim() === "") return bad(tk("正文是空的，没什么可审的"));

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "unauthorized", message: tk("请先登录再用 AI 审核") },
      { status: 401 }
    );
  }
  const access = await requirePermission(session, "ai_review");
  if (!access) {
    return NextResponse.json(
      { error: "forbidden", message: tk("你的账号还没开通 AI 审核，找管理员开通") },
      { status: 403 }
    );
  }
  const { userId } = access;
  const chosen = await getReviewModel();
  const provider = aiProvider(chosen.provider)!;
  const model = chosen.model;
  const key = await siteAiKey(provider);
  if (!key) {
    const locale = localeOfRequest(req);
    // Provider names are also shown per locale (as-is if not in the dictionary)
    const name = translate(provider.label, locale);
    return NextResponse.json(
      { error: "no_key", message: translate("还没有配置 {provider} 的 Key，到管理后台的「AI 设置」里填上", locale, { provider: name }) },
      { status: 503 }
    );
  }
  const limit = access.dailyLimit ?? aiDailyLimit();
  const slot = aiLimiter.take(userId, limit);
  if (!slot.ok) {
    return slot.reason === "busy"
      ? NextResponse.json({ error: "busy", message: tk("上一次还在跑，等它出来再点") }, { status: 409 })
      : NextResponse.json(
          { error: "rate_limited", message: translate("今天的 AI 次数用完了（每天 {limit} 次），明天再来", localeOfRequest(req), { limit }) },
          { status: 429 }
        );
  }
  const release = slot.release;

  try {
    const user = buildReviewUserPrompt(clipForReview(content));
    // Send all kinds at once and await each separately: reviewing several shouldn't take twice as long as one. One click counts as one quota use
    const parts = await Promise.all(
      kinds.map(async (kind): Promise<ReviewPart> => {
        try {
          const reply = await chatComplete(
            {
              provider,
              model,
              apiKey: key,
              // 「审核要求」 (review requirements) is editable by admins; the output format part is always appended after it
              system: reviewSystemPrompt(kind, await getReviewGuide(kind)),
              user,
              json: true,
            },
            // Leaving review in the page drops the connection; the signal is passed all the way to upstream
            { signal: req.signal }
          );
          // Parse with the original body: positions must match the editor's copy, not this truncated one
          return { kind, result: parseReviewResult(reply, content, kind) };
        } catch (e) {
          // The raw error goes only to server logs: upstream messages often carry internal details like request ids (same rule as lib/routeAuth)
          console.error(`AI 审核失败（${kind}）`, e);
          if (kinds.length === 1) throw e;
          // Reaching this Error branch almost always means the model didn't answer in format; parseReviewResult's message is fine to show the user
          return { kind, error: e instanceof Error ? e.message : tk("审核失败") };
        }
      })
    );
    // If every kind failed, don't pretend there's a result: report the first kind's error
    const failed = parts.find((p) => "error" in p);
    if (failed && "error" in failed && parts.every((p) => "error" in p)) {
      return NextResponse.json({ error: "failed", message: failed.error }, { status: 502 });
    }
    const result = mergeReviewResults(parts);
    const docId = cleanDocId(body.docId);
    let record = null;
    if (docId) {
      try {
        record = await saveReviewRecord({
          userId,
          docId,
          kinds,
          model: `${provider.id}/${model}`,
          result,
        });
      } catch (e) {
        console.error("存审核历史失败", e instanceof Error ? e.name : e);
      }
    }
    return NextResponse.json({ ...result, record });
  } catch (e) {
    if (e instanceof AiError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: STATUS[e.code] ?? 502 });
    }
    const message = e instanceof Error ? e.message : tk("审核失败，请稍后再试");
    return NextResponse.json({ error: "failed", message }, { status: 502 });
  } finally {
    release();
  }
}

const bad = (message: string) => NextResponse.json({ error: "bad_input", message }, { status: 400 });
const tooLarge = () =>
  NextResponse.json({ error: "too_large", message: tk("正文太长了") }, { status: 413 });
