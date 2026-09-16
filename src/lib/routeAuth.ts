import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * API 路由的共用前置：登录校验、文档归属校验、500 兜底。
 *
 * 这三件事原先每个路由各写一遍，写法一多就漂移：同一个「文档不存在」
 * 有的路由回 401 有的回 404，归属校验有的把整行正文一起捞出来只为判个权限。
 * 收到一处之后，路由体里只剩它自己的业务。
 */

/**
 * 登录校验。未登录返回现成的 401 响应，已登录返回 userId——用 isResponse 分辨：
 *
 * ```ts
 * const userId = await requireUserId();
 * if (isResponse(userId)) return userId;
 * ```
 */
export async function requireUserId(): Promise<string | NextResponse> {
  const session = await auth();
  return session?.user?.id ?? NextResponse.json({ error: "未登录" }, { status: 401 });
}

/** require* 返回的是不是「照原样回给客户端」的响应（401/404），而不是要的数据 */
export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/** 归属校验默认取的字段：判权限、留版、记日志都够用，正文（大字段）不拉 */
const DOC_BRIEF = { id: true, userId: true, title: true } satisfies Prisma.DocumentSelect;

/**
 * 文档归属校验：查不到（不存在，或属于别人——两者对外不可区分）返回 404 响应。
 * 已经过 requireUserId 的调用方走到这里只可能是 404，不该再回 401。
 *
 * - `select`：要正文之类的额外字段时自己传，默认只取 DOC_BRIEF。
 * - `liveOnly`：回收站里的文章也算「不存在」（分享、改写这类操作不该落在废稿上）。
 */
export async function requireOwnedDoc<S extends Prisma.DocumentSelect = typeof DOC_BRIEF>(
  id: string,
  userId: string,
  opts: { select?: S; liveOnly?: boolean } = {}
): Promise<Prisma.DocumentGetPayload<{ select: S }> | NextResponse> {
  // 默认 select 只在调用方没传时用到，此时 S 就是 typeof DOC_BRIEF
  const select = (opts.select ?? DOC_BRIEF) as S;
  const doc = await prisma.document.findFirst({
    where: { id, userId, ...(opts.liveOnly ? { deletedAt: null } : {}) },
    select,
  });
  if (!doc) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  return doc;
}

/**
 * 兜底 500。原始错误只进服务端日志：上游（OSS、飞书）的报文常带内部地址、
 * 请求 id 甚至凭证片段，原样回给浏览器等于把内部细节公开。
 * 需要用户自己处置的错误（如飞书要重新授权）由调用方在 catch 里先分流，别走到这里。
 */
export function serverError(e: unknown, fallback: string): NextResponse {
  console.error(fallback, e);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
