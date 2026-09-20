import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminSessionUserId } from "@/lib/admin";
import { AiError, chatComplete } from "@/lib/ai/chat";
import { aiProvider, cleanModel } from "@/lib/ai/providers";
import { DEFAULT_REVIEW_KIND, isReviewKind } from "@/lib/ai/reviewKinds";
import {
  buildReviewUserPrompt,
  clipForReview,
  parseReviewResult,
  reviewSystemPrompt,
} from "@/lib/ai/reviewPrompt";
import { siteAiKey } from "@/lib/ai/serverKeys";
import { aiLimiter, aiDailyLimit } from "@/lib/ai/limit";

/**
 * AI 文章审核：正文进去，一份 ReviewResult 出来（形状见 features/review/types）。
 *
 * key 只有一个来路：站点配在环境变量里的那份（见 lib/ai/serverKeys）。
 * 前端只报「用哪家的哪个模型」，请求体里不收任何 key——带了也不看。
 * 花的是站点的钱，口径与 AI 生成封面一致：必须登录，且只对 ADMIN_EMAILS 白名单开放，
 * 另按账号限量。
 */

/** 请求体上限：正文这边自己会截到 24k 字，留足余量，再多就是有人在灌 */
const MAX_BODY_BYTES = 512 * 1024;

/** 错误码 → HTTP 状态；没列的（上游的各种毛病）一律 502 */
const STATUS: Partial<Record<string, number>> = {
  no_key: 503,
  bad_key: 401,
  bad_input: 400,
  rate_limited: 429,
  timeout: 504,
};

interface Body {
  content?: unknown;
  provider?: unknown;
  model?: unknown;
  /** 审哪一类（表述 / 公众号规则），不给就按表述审；见 lib/ai/reviewKinds */
  kind?: unknown;
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

  const provider = aiProvider(body.provider);
  if (!provider) return bad("认不出这个 AI 供应商");
  // 没给就是老版网页或第三方在调，按表述审核办；给了但不认识的一律挡下——
  // 悄悄换成另一类审核，用户拿到的意见会驴唇不对马嘴
  const kind = body.kind === undefined ? DEFAULT_REVIEW_KIND : body.kind;
  if (!isReviewKind(kind)) return bad("认不出这个审核类型");
  const content = typeof body.content === "string" ? body.content : "";
  if (content.trim() === "") return bad("正文是空的，没什么可审的");
  const model = cleanModel(body.model, provider);

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "unauthorized", message: "请先登录再用 AI 审核" },
      { status: 401 }
    );
  }
  const userId = adminSessionUserId(session);
  if (!userId) {
    return NextResponse.json(
      { error: "forbidden", message: "AI 审核目前只对管理员开放" },
      { status: 403 }
    );
  }
  const key = siteAiKey(provider);
  if (!key) {
    return NextResponse.json(
      { error: "no_key", message: `站点还没有配置 ${provider.label} 的 Key，换一家模型试试` },
      { status: 503 }
    );
  }
  const limit = aiDailyLimit();
  const slot = aiLimiter.take(userId, limit);
  if (!slot.ok) {
    return slot.reason === "busy"
      ? NextResponse.json({ error: "busy", message: "上一次还在跑，等它出来再点" }, { status: 409 })
      : NextResponse.json(
          { error: "rate_limited", message: `今天的 AI 次数用完了（每天 ${limit} 次），明天再来` },
          { status: 429 }
        );
  }
  const release = slot.release;

  try {
    const clipped = clipForReview(content);
    const reply = await chatComplete(
      {
        provider,
        model,
        apiKey: key,
        system: reviewSystemPrompt(kind),
        user: buildReviewUserPrompt(clipped),
        json: true,
      },
      // 网页退出审核就断连接，signal 一路传给上游
      { signal: req.signal }
    );
    // 用原始正文解析：定位要对的是编辑器里那一份，不是截断过的这份
    return NextResponse.json(parseReviewResult(reply, content, kind));
  } catch (e) {
    // 原始错误只进服务端日志：上游报文常带请求 id 之类的内部细节（口径同 lib/routeAuth）
    console.error("AI 审核失败", e);
    if (e instanceof AiError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: STATUS[e.code] ?? 502 });
    }
    // 走到这儿基本就是模型没按格式回答，parseReviewResult 的那句话正好给用户看
    const message = e instanceof Error ? e.message : "审核失败，请稍后再试";
    return NextResponse.json({ error: "failed", message }, { status: 502 });
  } finally {
    release();
  }
}

const bad = (message: string) => NextResponse.json({ error: "bad_input", message }, { status: 400 });
const tooLarge = () =>
  NextResponse.json({ error: "too_large", message: "正文太长了" }, { status: 413 });
