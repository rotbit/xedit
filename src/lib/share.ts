import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ShareCommentJson } from "@/features/share/types";

export type { ShareCommentJson };

/** Annotation cap per share (replies included), to prevent anonymous spam */
export const SHARE_COMMENT_CAP = 1000;

export function hashGuestKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Fetch a valid share by token (with document ownership); null if closed/expired/missing.
 * Links are now permanent by default (expiresAt is null); legacy records with an expiry are still supported. */
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

/** Serialize annotations: keyHash is used to mark "your own", and the hash itself is never sent */
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
