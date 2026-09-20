import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminSessionUserId } from "@/lib/admin";
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

/**
 * AI 文章审核：正文进去，一份 ReviewResult 出来（形状见 features/review/types）。
 *
 * 用哪家的哪个模型、key 是什么、提示词怎么写，全由管理后台定（见 lib/ai/siteSettings，环境变量兜底）。
 * 请求体里只收正文和审核类型（可以一次勾几类，各跑各的提示词，合成一份结果）——provider / model / key 带了也不看。
 * 花的是站点的钱，口径与 AI 生成封面一致：必须登录，且只对 ADMIN_EMAILS 白名单开放，
 * 另按账号限量。
 *
 * 请求里带了 docId 的，跑成之后存一条历史（见 lib/ai/reviewHistory），回包里多一个 record；
 * 存不进去不算审核失败——意见照给，只是这一趟回看不了。
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
  /** 审哪几类（表述 / 公众号规则，可多选）；见 lib/ai/reviewKinds */
  kinds?: unknown;
  /** 单选时代的写法，老网页还在用；两个都不给就按表述审 */
  kind?: unknown;
  /** 哪篇文章：给了才记历史 */
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

  // 没给就是老版网页或第三方在调，按表述审核办；给了但不认识的一律挡下——
  // 悄悄换成另一类审核，用户拿到的意见会驴唇不对马嘴
  const asked: unknown[] = Array.isArray(body.kinds)
    ? body.kinds
    : [body.kind === undefined ? DEFAULT_REVIEW_KIND : body.kind];
  if (asked.length === 0 || !asked.every(isReviewKind)) return bad("认不出这个审核类型");
  const kinds = cleanReviewKinds(asked);
  const content = typeof body.content === "string" ? body.content : "";
  if (content.trim() === "") return bad("正文是空的，没什么可审的");

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
  const chosen = await getReviewModel();
  const provider = aiProvider(chosen.provider)!;
  const model = chosen.model;
  const key = await siteAiKey(provider);
  if (!key) {
    return NextResponse.json(
      { error: "no_key", message: `还没有配置 ${provider.label} 的 Key，到管理后台的「AI 设置」里填上` },
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
    const user = buildReviewUserPrompt(clipForReview(content));
    // 几类同时发出去、各等各的：一起审不该比审一类慢一倍。一次点击只算一次额度
    const parts = await Promise.all(
      kinds.map(async (kind): Promise<ReviewPart> => {
        try {
          const reply = await chatComplete(
            {
              provider,
              model,
              apiKey: key,
              // 「审核要求」管理员可以在后台改；输出格式那段是固定接在后面的
              system: reviewSystemPrompt(kind, await getReviewGuide(kind)),
              user,
              json: true,
            },
            // 网页退出审核就断连接，signal 一路传给上游
            { signal: req.signal }
          );
          // 用原始正文解析：定位要对的是编辑器里那一份，不是截断过的这份
          return { kind, result: parseReviewResult(reply, content, kind) };
        } catch (e) {
          // 原始错误只进服务端日志：上游报文常带请求 id 之类的内部细节（口径同 lib/routeAuth）
          console.error(`AI 审核失败（${kind}）`, e);
          if (kinds.length === 1) throw e;
          // 走到 Error 这一支基本就是模型没按格式回答，parseReviewResult 的那句话正好给用户看
          return { kind, error: e instanceof Error ? e.message : "审核失败" };
        }
      })
    );
    // 全军覆没就别装作有结果：按第一类的说法报错
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
    const message = e instanceof Error ? e.message : "审核失败，请稍后再试";
    return NextResponse.json({ error: "failed", message }, { status: 502 });
  } finally {
    release();
  }
}

const bad = (message: string) => NextResponse.json({ error: "bad_input", message }, { status: 400 });
const tooLarge = () =>
  NextResponse.json({ error: "too_large", message: "正文太长了" }, { status: 413 });
