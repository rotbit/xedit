import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { isResponse, requireOwnedDoc, requireUserId } from "@/lib/routeAuth";
import { tk } from "@/i18n/t";

type Params = { params: Promise<{ id: string }> };

/** Login + ownership check. liveOnly: trashed drafts shouldn't be able to open share links */
async function author(id: string) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  return requireOwnedDoc(id, userId, { liveOnly: true });
}

function shareJson(
  share: { id: string; enabled: boolean; allowComment: boolean; expiresAt: Date | null } | null,
  commentCount = 0
) {
  if (!share) return { enabled: false };
  // Links are permanent by default; legacy records may still carry an expiry, and expired means closed
  const expired = share.expiresAt !== null && share.expiresAt.getTime() <= Date.now();
  return {
    enabled: share.enabled && !expired,
    allowComment: share.allowComment,
    token: share.id,
    commentCount,
  };
}

async function countThreads(shareId: string) {
  return prisma.shareComment.count({ where: { shareId, parentId: null } });
}

/** Share status (with annotation count); expired means closed */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const doc = await author(id);
  if (isResponse(doc)) return doc;
  const share = await prisma.docShare.findUnique({ where: { documentId: id } });
  return NextResponse.json(shareJson(share, share ? await countThreads(share.id) : 0));
}

/** Enable sharing; the link never expires (expiresAt null) and only the author closes it manually.
 * - First enable or re-enable (including ones that expired in the past): generate a fresh token, killing the old link immediately;
 *   annotations follow the new token via the FK's ON UPDATE CASCADE, so nothing is lost.
 * - Repeat calls while enabled: return the current link as-is (idempotent);
 *   the link has already gone out to reviewers and shouldn't change because of another click.
 * body.allowComment is optional, letting the author set the annotation toggle while enabling.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const doc = await author(id);
  if (isResponse(doc)) return doc;
  const denied = await readOnlyGuard(doc.userId);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const allowComment = typeof body.allowComment === "boolean" ? body.allowComment : undefined;

  const existing = await prisma.docShare.findUnique({ where: { documentId: id } });
  const live =
    existing &&
    existing.enabled &&
    (existing.expiresAt === null || existing.expiresAt.getTime() > Date.now());
  const share = existing
    ? await prisma.docShare.update({
        where: { documentId: id },
        data: live
          ? { ...(allowComment === undefined ? {} : { allowComment }) }
          : {
              id: randomBytes(16).toString("hex"),
              enabled: true,
              expiresAt: null,
              ...(allowComment === undefined ? {} : { allowComment }),
            },
      })
    : await prisma.docShare.create({
        data: {
          id: randomBytes(16).toString("hex"),
          documentId: id,
          userId: doc.userId,
          ...(allowComment === undefined ? {} : { allowComment }),
        },
      });
  return NextResponse.json(shareJson(share, await countThreads(share.id)));
}

/** Update toggles: enabled (only for closing) / allowComment */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const doc = await author(id);
  if (isResponse(doc)) return doc;
  // Changing share toggles is also a write, so read-only bans must block it too (same guard as POST)
  const denied = await readOnlyGuard(doc.userId);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const data: { enabled?: boolean; allowComment?: boolean } = {};
  if (body.enabled === false) data.enabled = false;
  if (typeof body.allowComment === "boolean") data.allowComment = body.allowComment;
  const share = await prisma.docShare
    .update({ where: { documentId: id }, data })
    .catch(() => null);
  if (!share) return NextResponse.json({ error: tk("尚未创建分享") }, { status: 404 });
  return NextResponse.json(shareJson(share, await countThreads(share.id)));
}
