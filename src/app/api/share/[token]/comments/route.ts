import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  SHARE_COMMENT_CAP,
  commentJson,
  findEnabledShare,
  hashGuestKey,
} from "@/lib/share";

type Params = { params: Promise<{ token: string }> };

/** 批注列表（公开）。带 x-guest-key 头时据此标记「自己的」，供刷新后仍可删改 */
export async function GET(req: Request, { params }: Params) {
  const { token } = await params;
  const share = await findEnabledShare(token);
  if (!share) return NextResponse.json({ error: "分享不存在或已关闭" }, { status: 404 });

  const key = req.headers.get("x-guest-key") ?? "";
  const session = await auth();
  const viewer = {
    keyHash: key ? hashGuestKey(key) : "",
    isOwner: session?.user?.id === share.userId,
  };
  const comments = await prisma.shareComment.findMany({
    where: { shareId: share.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(comments.map((c) => commentJson(c, viewer)));
}

/** 新增批注/回复（公开，无需登录；作者登录态发表则标记 isOwner） */
export async function POST(req: Request, { params }: Params) {
  const { token } = await params;
  const share = await findEnabledShare(token);
  if (!share) return NextResponse.json({ error: "分享不存在或已关闭" }, { status: 404 });
  if (!share.allowComment) {
    return NextResponse.json({ error: "该分享未开放批注" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (!text) return NextResponse.json({ error: "批注内容不能为空" }, { status: 400 });
  const key = typeof body.key === "string" ? body.key.slice(0, 64) : "";
  const parentId = typeof body.parentId === "string" ? body.parentId : null;

  const session = await auth();
  const isOwner = session?.user?.id === share.userId;
  const author = isOwner
    ? session?.user?.name?.trim() || "作者"
    : (typeof body.author === "string" && body.author.trim().slice(0, 30)) || "访客";

  // 回复必须挂在本分享的顶级批注下
  if (parentId) {
    const parent = await prisma.shareComment.findFirst({
      where: { id: parentId, shareId: share.id, parentId: null },
      select: { id: true },
    });
    if (!parent) return NextResponse.json({ error: "批注不存在" }, { status: 404 });
  } else {
    const anchorText = typeof body.anchorText === "string" ? body.anchorText.slice(0, 1000) : "";
    if (!anchorText.trim()) {
      return NextResponse.json({ error: "缺少批注锚点" }, { status: 400 });
    }
  }

  const total = await prisma.shareComment.count({ where: { shareId: share.id } });
  if (total >= SHARE_COMMENT_CAP) {
    return NextResponse.json({ error: "该分享的批注数已达上限" }, { status: 429 });
  }

  const created = await prisma.shareComment.create({
    data: {
      shareId: share.id,
      parentId,
      author,
      authorKeyHash: !isOwner && key ? hashGuestKey(key) : "",
      isOwner,
      anchorText: parentId
        ? ""
        : (typeof body.anchorText === "string" ? body.anchorText.slice(0, 1000) : ""),
      anchorPrefix: parentId
        ? ""
        : (typeof body.anchorPrefix === "string" ? body.anchorPrefix.slice(0, 64) : ""),
      anchorIndex:
        !parentId && Number.isInteger(body.anchorIndex) && body.anchorIndex >= 0
          ? Math.min(body.anchorIndex, 9999)
          : 0,
      body: text,
    },
  });
  return NextResponse.json(
    commentJson(created, { keyHash: created.authorKeyHash, isOwner })
  );
}
