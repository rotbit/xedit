import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminSessionUserId } from "@/lib/admin";
import { coverLimiter } from "@/lib/coverGenerate/limit";
import {
  CoverError,
  clampCoverCount,
  coverDailyLimit,
  coverGenerateConfigured,
  generateCovers,
  isCoverStyle,
} from "@/lib/coverGenerate/replicate";

/**
 * AI 生成公众号封面：Replicate Token 只在服务端用，浏览器全程碰不到，只拿得到图。
 * 生图按张收费、花的是站点的账户，所以目前只对 ADMIN_EMAILS 白名单里的管理员开放，
 * 并按账号限量（同时只能生一张、每天 COVER_GENERATE_DAILY_LIMIT 张，见 lib/coverGenerate/limit）。
 */

/** 请求体上限：里面只有一句描述加一个风格，16KB 绰绰有余 */
const MAX_BODY_BYTES = 16 * 1024;

/** 错误码 → HTTP 状态；没列的（上游的各种毛病）一律 502，别让浏览器以为是自己发错了 */
const STATUS: Partial<Record<string, number>> = {
  no_token: 503,
  bad_input: 400,
  rate_limited: 429,
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "unauthorized", message: "请先登录再使用 AI 生成封面" },
      { status: 401 }
    );
  }
  // 管理员身份按服务端的 ADMIN_EMAILS 现算，不信任请求里的任何字段
  const userId = adminSessionUserId(session);
  if (!userId) {
    return NextResponse.json(
      { error: "forbidden", message: "AI 生成封面目前只对管理员开放" },
      { status: 403 }
    );
  }
  if (!coverGenerateConfigured()) {
    return NextResponse.json(
      { error: "no_token", message: "服务端还没有配置 AI 生成封面" },
      { status: 503 }
    );
  }

  // content-length 可以缺失也可以撒谎，所以读完再按真实字节数复核一次
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return tooLarge();

  // 解析不出来就当空对象：下面每个字段自带类型判断，效果就是「描述是空的」
  let body: { prompt?: unknown; style?: unknown; count?: unknown } = {};
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {}
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json(
      { error: "bad_input", message: "封面描述是空的，写一句想画什么" },
      { status: 400 }
    );
  }
  const style = isCoverStyle(body.style) ? body.style : null;
  const count = clampCoverCount(body.count);

  const limit = coverDailyLimit();
  const slot = coverLimiter.take(userId, limit);
  if (!slot.ok) {
    return slot.reason === "busy"
      ? NextResponse.json(
          { error: "busy", message: "上一张还在生成，等它出来再点" },
          { status: 409 }
        )
      : NextResponse.json(
          { error: "rate_limited", message: `今天的 AI 生成封面次数用完了（每天 ${limit} 次），明天再来` },
          { status: 429 }
        );
  }
  try {
    // 网页关掉面板就断连接，signal 一路传给上游，别让没人要的图接着烧额度
    const images = await generateCovers({ prompt, style, count }, { signal: req.signal });
    return NextResponse.json({ images });
  } catch (e) {
    // 原始错误只进服务端日志：上游报文常带请求 id 之类的内部细节（口径同 lib/routeAuth 的 serverError）
    console.error("AI 生成封面失败", e);
    const code = e instanceof CoverError ? e.code : "failed";
    const message = e instanceof CoverError ? e.message : "生成失败，请稍后再试";
    return NextResponse.json({ error: code, message }, { status: STATUS[code] ?? 502 });
  } finally {
    slot.release();
  }
}

const tooLarge = () =>
  NextResponse.json({ error: "too_large", message: "封面描述太长了" }, { status: 413 });
