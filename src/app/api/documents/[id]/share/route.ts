import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { SHARE_TTL_MS } from "@/lib/share";

type Params = { params: Promise<{ id: string }> };

/** 校验登录且文章归属当前用户 */
async function ownedDoc(id: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.document.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
    select: { id: true, userId: true },
  });
}

function shareJson(
  share: { id: string; enabled: boolean; allowComment: boolean; expiresAt: Date } | null,
  commentCount = 0
) {
  if (!share) return { enabled: false };
  const expired = share.expiresAt.getTime() <= Date.now();
  return {
    enabled: share.enabled && !expired,
    allowComment: share.allowComment,
    token: share.id,
    expiresAt: share.expiresAt.toISOString(),
    commentCount,
  };
}

async function countThreads(shareId: string) {
  return prisma.shareComment.count({ where: { shareId, parentId: null } });
}

/** 分享状态（含批注数）；过期视同关闭 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const doc = await ownedDoc(id);
  if (!doc) return NextResponse.json({ error: "未登录或文档不存在" }, { status: 401 });
  const share = await prisma.docShare.findUnique({ where: { documentId: id } });
  return NextResponse.json(shareJson(share, share ? await countThreads(share.id) : 0));
}

/** 开启分享。
 * - 首次或重新开启（含已过期）：生成全新 token，旧链接立刻作废；
 *   批注靠外键 ON UPDATE CASCADE 跟着新 token 走，不会丢。
 * - 开启中调用（续期）：沿用当前链接，只把有效期顺延 48 小时——
 *   已把链接发给审阅人后续期不应换址。
 */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const doc = await ownedDoc(id);
  if (!doc) return NextResponse.json({ error: "未登录或文档不存在" }, { status: 401 });
  const denied = await readOnlyGuard(doc.userId);
  if (denied) return denied;

  const expiresAt = new Date(Date.now() + SHARE_TTL_MS);
  const existing = await prisma.docShare.findUnique({ where: { documentId: id } });
  const live = existing && existing.enabled && existing.expiresAt.getTime() > Date.now();
  const share = existing
    ? await prisma.docShare.update({
        where: { documentId: id },
        data: live
          ? { expiresAt }
          : { id: randomBytes(16).toString("hex"), enabled: true, expiresAt },
      })
    : await prisma.docShare.create({
        data: {
          id: randomBytes(16).toString("hex"),
          documentId: id,
          userId: doc.userId,
          expiresAt,
        },
      });
  return NextResponse.json(shareJson(share, await countThreads(share.id)));
}

/** 更新开关：enabled（仅用于关闭）/ allowComment */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const doc = await ownedDoc(id);
  if (!doc) return NextResponse.json({ error: "未登录或文档不存在" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const data: { enabled?: boolean; allowComment?: boolean } = {};
  if (body.enabled === false) data.enabled = false;
  if (typeof body.allowComment === "boolean") data.allowComment = body.allowComment;
  const share = await prisma.docShare
    .update({ where: { documentId: id }, data })
    .catch(() => null);
  if (!share) return NextResponse.json({ error: "尚未创建分享" }, { status: 404 });
  return NextResponse.json(shareJson(share, await countThreads(share.id)));
}
