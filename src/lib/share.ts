import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ShareCommentJson } from "@/features/share/types";

export type { ShareCommentJson };

/** 单个分享的批注上限（含回复），防匿名灌水 */
export const SHARE_COMMENT_CAP = 1000;

export function hashGuestKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** 按 token 取有效的分享（含文档归属），关闭/过期/不存在返回 null。
 * 链接现在默认永久（expiresAt 为 null）；仍兼容历史上带到期时刻的记录。 */
export function findEnabledShare(token: string) {
  if (!/^[0-9a-f]{16,64}$/.test(token)) return null;
  return prisma.docShare.findFirst({
    where: {
      id: token,
      enabled: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true, documentId: true, userId: true, allowComment: true },
  });
}

/** 序列化批注：keyHash 用于标记「自己的」，绝不下发 hash 本身 */
export function commentJson(
  c: {
    id: string;
    parentId: string | null;
    author: string;
    isOwner: boolean;
    authorKeyHash: string;
    anchorType: string;
    anchorText: string;
    anchorPrefix: string;
    anchorIndex: number;
    body: string;
    resolvedAt: Date | null;
    createdAt: Date;
  },
  viewer: { keyHash: string; isOwner: boolean }
): ShareCommentJson {
  return {
    id: c.id,
    parentId: c.parentId,
    author: c.author,
    isOwner: c.isOwner,
    mine: viewer.isOwner || (c.authorKeyHash !== "" && c.authorKeyHash === viewer.keyHash),
    anchorType: c.anchorType === "media" ? "media" : "text",
    anchorText: c.anchorText,
    anchorPrefix: c.anchorPrefix,
    anchorIndex: c.anchorIndex,
    body: c.body,
    resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}
