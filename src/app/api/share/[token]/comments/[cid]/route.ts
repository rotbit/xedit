import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findEnabledShare, hashGuestKey } from "@/lib/share";

type Params = { params: Promise<{ token: string; cid: string }> };

/** 取出批注并校验操作者：文档作者，或凭 key 认领的批注作者本人。
 *  访客 key 一律从 x-guest-key 头取（PATCH 早先从 body 里取，两处对不上），
 *  解析也收在这里一处——请求体的形状不该决定身份从哪儿读。 */
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

/** 销记/恢复（仅顶级批注）：{ resolved: boolean } */
export async function PATCH(req: Request, { params }: Params) {
  const { token, cid } = await params;
  const body = await req.json().catch(() => ({}));
  const comment = await authorizedComment(req, token, cid);
  if (!comment) return NextResponse.json({ error: "无权操作或批注不存在" }, { status: 403 });
  if (comment.parentId) {
    return NextResponse.json({ error: "回复不能单独销记" }, { status: 400 });
  }
  if (typeof body.resolved !== "boolean") {
    return NextResponse.json({ error: "缺少 resolved 参数" }, { status: 400 });
  }
  await prisma.shareComment.update({
    where: { id: cid },
    data: { resolvedAt: body.resolved ? new Date() : null },
  });
  return NextResponse.json({ ok: true });
}

/** 删除批注；顶级批注连带其回复 */
export async function DELETE(req: Request, { params }: Params) {
  const { token, cid } = await params;
  const comment = await authorizedComment(req, token, cid);
  if (!comment) return NextResponse.json({ error: "无权操作或批注不存在" }, { status: 403 });
  await prisma.$transaction([
    prisma.shareComment.deleteMany({ where: { parentId: cid } }),
    prisma.shareComment.delete({ where: { id: cid } }),
  ]);
  return NextResponse.json({ ok: true });
}
