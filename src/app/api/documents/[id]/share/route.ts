import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";

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
  share: { id: string; enabled: boolean; allowComment: boolean; expiresAt: Date | null } | null,
  commentCount = 0
) {
  if (!share) return { enabled: false };
  // 链接默认永久；历史记录可能仍带到期时刻，过期一律视同关闭
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

/** 分享状态（含批注数）；过期视同关闭 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const doc = await ownedDoc(id);
  if (!doc) return NextResponse.json({ error: "未登录或文档不存在" }, { status: 401 });
  const share = await prisma.docShare.findUnique({ where: { documentId: id } });
  return NextResponse.json(shareJson(share, share ? await countThreads(share.id) : 0));
}

/** 开启分享，链接永久有效（expiresAt 置空），只由作者手动关闭。
 * - 首次或重新开启（含历史上已过期的）：生成全新 token，旧链接立刻作废；
 *   批注靠外键 ON UPDATE CASCADE 跟着新 token 走，不会丢。
 * - 已开启时重复调用：沿用当前链接原样返回（幂等）——
 *   链接已发给审阅人，不该因为再点一次就换址。
 * body.allowComment 可选，让作者在开启的同时就定下批注开关。
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const doc = await ownedDoc(id);
  if (!doc) return NextResponse.json({ error: "未登录或文档不存在" }, { status: 401 });
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
