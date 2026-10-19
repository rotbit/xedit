import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { tk } from "@/i18n/t";

/**
 * Shared preamble for API routes: login check, document ownership check, 500 fallback.
 *
 * Each route used to write these itself and they drifted: the same "document not found"
 * returned 401 in some routes and 404 in others, and some ownership checks pulled the whole body just to check permission.
 * With them consolidated, the route body contains only its own business logic.
 */

/**
 * Login check. Returns a ready 401 response if not logged in, else the userId; tell them apart with isResponse:
 *
 * ```ts
 * const userId = await requireUserId();
 * if (isResponse(userId)) return userId;
 * ```
 */
export async function requireUserId(): Promise<string | NextResponse> {
  const session = await auth();
  return session?.user?.id ?? NextResponse.json({ error: tk("未登录") }, { status: 401 });
}

/** Whether a require* result is a response to "return to the client as-is" (401/404) rather than the wanted data */
export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/** Fields fetched by default for the ownership check: enough for permission, versioning and logging; the body (a large field) isn't pulled */
const DOC_BRIEF = { id: true, userId: true, title: true } satisfies Prisma.DocumentSelect;

/**
 * Document ownership check: if not found (nonexistent or someone else's, indistinguishable externally) return a 404 response.
 * Callers that already passed requireUserId can only get 404 here, never 401 again.
 *
 * - `select`: pass it yourself for extra fields like the body; defaults to DOC_BRIEF only.
 * - `liveOnly`: articles in the trash also count as "not found" (sharing, rewriting etc. shouldn't land on discarded drafts).
 */
export async function requireOwnedDoc<S extends Prisma.DocumentSelect = typeof DOC_BRIEF>(
  id: string,
  userId: string,
  opts: { select?: S; liveOnly?: boolean } = {}
): Promise<Prisma.DocumentGetPayload<{ select: S }> | NextResponse> {
  // The default select is used only when the caller passes none, in which case S is typeof DOC_BRIEF
  const select = (opts.select ?? DOC_BRIEF) as S;
  const doc = await prisma.document.findFirst({
    where: { id, userId, ...(opts.liveOnly ? { deletedAt: null } : {}) },
    select,
  });
  if (!doc) return NextResponse.json({ error: tk("文档不存在") }, { status: 404 });
  return doc;
}

/**
 * 500 fallback. The raw error goes only to server logs: upstream (OSS, Feishu) payloads often include internal addresses,
 * request ids or even credential fragments, and returning them to the browser would expose internals.
 * Errors the user must handle themselves (e.g. Feishu needing re-authorization) are routed by the caller in catch first, never reaching here.
 */
export function serverError(e: unknown, fallback: string): NextResponse {
  console.error(fallback, e);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
