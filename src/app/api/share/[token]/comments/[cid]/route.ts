import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findEnabledShare, hashGuestKey } from "@/lib/share";
import { tk } from "@/i18n/t";

type Params = { params: Promise<{ token: string; cid: string }> };

/** Load the annotation and verify the actor: the doc author, or the annotation's own author via a claimed key.
 *  The guest key always comes from the x-guest-key header (PATCH used to read it from the body, so the two disagreed),
 *  and parsing lives in this one place: the request body's shape shouldn't decide where identity is read from. */
async function authorizedComment(req: Request, token: string, cid: string) {
  const key = req.headers.get("x-guest-key")?.slice(0, 64) ?? "";
  const share = await findEnabledShare(token);
  if (!share) return null;
  const comment = await prisma.shareComment.findFirst({
    where: { id: cid, shareId: share.id },
  });
  if (!comment) return null;
  const session = await auth();
  const isOwner = session?.user?.id === share.userId;
  const isAuthor =
    comment.authorKeyHash !== "" && key !== "" && comment.authorKeyHash === hashGuestKey(key);
  if (!isOwner && !isAuthor) return null;
  return comment;
}

/** Resolve/reopen (top-level annotations only): { resolved: boolean } */
export async function PATCH(req: Request, { params }: Params) {
  const { token, cid } = await params;
  const body = await req.json().catch(() => ({}));
  const comment = await authorizedComment(req, token, cid);
  if (!comment) return NextResponse.json({ error: tk("无权操作或批注不存在") }, { status: 403 });
  if (comment.parentId) {
    return NextResponse.json({ error: tk("回复不能单独销记") }, { status: 400 });
  }
  if (typeof body.resolved !== "boolean") {
    return NextResponse.json({ error: tk("缺少 resolved 参数") }, { status: 400 });
  }
  await prisma.shareComment.update({
    where: { id: cid },
    data: { resolvedAt: body.resolved ? new Date() : null },
  });
  return NextResponse.json({ ok: true });
}

/** Delete an annotation; a top-level one takes its replies with it */
export async function DELETE(req: Request, { params }: Params) {
  const { token, cid } = await params;
  const comment = await authorizedComment(req, token, cid);
  if (!comment) return NextResponse.json({ error: tk("无权操作或批注不存在") }, { status: 403 });
  await prisma.$transaction([
    prisma.shareComment.deleteMany({ where: { parentId: cid } }),
    prisma.shareComment.delete({ where: { id: cid } }),
  ]);
  return NextResponse.json({ ok: true });
}
