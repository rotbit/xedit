import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { coverLimiter } from "@/lib/coverGenerate/limit";
import { requirePermission } from "@/lib/permissions";
import {
  CoverError,
  coverDailyLimit,
  coverFields,
  coverGenerateConfigured,
  generateCovers,
  type CoverFields,
  type CoverRequest,
} from "@/lib/coverGenerate/replicate";
import { tk, translate } from "@/i18n/t";
import { localeOfRequest } from "@/i18n/server";

/**
 * AI-generated WeChat covers: the Replicate token is used only server-side; the browser never touches it and only gets the image.
 * Image generation is billed per image on the site's account, so it's only open to accounts with ai_cover permission (see lib/permissions; admins have it built in),
 * and is rate-limited per account (one at a time, COVER_GENERATE_DAILY_LIMIT per day by default, overridable per account in admin; see lib/coverGenerate/limit).
 */

/** Request body cap: it only holds a title, two key phrases and two product names; 16KB is plenty */
const MAX_BODY_BYTES = 16 * 1024;

/** Error code → HTTP status; anything unlisted (assorted upstream issues) is 502, so the browser doesn't think it sent something wrong */
const STATUS: Partial<Record<string, number>> = {
  no_token: 503,
  bad_input: 400,
  rate_limited: 429,
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "unauthorized", message: tk("请先登录再使用 AI 生成封面") },
      { status: 401 }
    );
  }
  // Permission is queried fresh from the DB each time (revocation takes effect immediately); trust nothing in the request
  const access = await requirePermission(session, "ai_cover");
  if (!access) {
    return NextResponse.json(
      { error: "forbidden", message: tk("你的账号还没开通 AI 生成封面，找管理员开通") },
      { status: 403 }
    );
  }
  const { userId } = access;
  if (!coverGenerateConfigured()) {
    return NextResponse.json(
      { error: "no_token", message: tk("服务端还没有配置 AI 生成封面") },
      { status: 503 }
    );
  }

  // content-length can be missing or lie, so recheck the real byte count after reading
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return tooLarge();

  // If it can't be parsed (or isn't an object), treat it as empty: each field below sanitizes itself, so the effect is "the title is empty"
  let body: CoverRequest = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") body = parsed as CoverRequest;
  } catch {}
  // Sanitize fields first: a missing required one is a 400, and this must happen before rate limiting so a malformed request doesn't burn today's quota
  let fields: CoverFields;
  try {
    fields = coverFields(body);
  } catch (e) {
    const message = e instanceof CoverError ? e.message : tk("封面信息不完整");
    return NextResponse.json({ error: "bad_input", message }, { status: 400 });
  }

  const limit = access.dailyLimit ?? coverDailyLimit();
  const slot = coverLimiter.take(userId, limit);
  if (!slot.ok) {
    return slot.reason === "busy"
      ? NextResponse.json(
          { error: "busy", message: tk("上一张还在生成，等它出来再点") },
          { status: 409 }
        )
      : NextResponse.json(
          { error: "rate_limited", message: translate("今天的 AI 生成封面次数用完了（每天 {limit} 次），明天再来", localeOfRequest(req), { limit }) },
          { status: 429 }
        );
  }
  try {
    // Closing the panel in the page drops the connection; the signal is passed through to upstream so an unwanted image doesn't keep burning quota
    const images = await generateCovers(fields, { signal: req.signal });
    return NextResponse.json({ images });
  } catch (e) {
    // The raw error goes only to server logs: upstream messages often carry internal details like request ids (same rule as lib/routeAuth's serverError)
    console.error("AI 生成封面失败", e);
    const code = e instanceof CoverError ? e.code : "failed";
    const message = e instanceof CoverError ? e.message : tk("生成失败，请稍后再试");
    return NextResponse.json({ error: code, message }, { status: STATUS[code] ?? 502 });
  } finally {
    slot.release();
  }
}

const tooLarge = () =>
  NextResponse.json({ error: "too_large", message: tk("封面信息太长了") }, { status: 413 });
