import { prisma } from "@/lib/prisma";
import { uploadBlocked } from "@/lib/guards";
import { ossDelete, ossObjectKey, ossUrlOf } from "@/lib/oss";
import { MEDIA_EXT } from "@/lib/media";
import { tk } from "@/i18n/t";

export const UPLOAD_TTL = 300;

export class UploadError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** Release abandoned reservations only after deleting their objects and a one-hour grace for in-flight OSS uploads. */
async function cleanAbandoned(userId: string): Promise<void> {
  const rows = await prisma.uploadReservation.findMany({
    where: { userId, expiresAt: { lt: new Date(Date.now() - 3600_000) } }, take: 20,
  });
  for (const row of rows) {
    try {
      const claimed = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
        return tx.uploadReservation.updateMany({
          where: { key: row.key, userId }, data: { state: "cleaning" },
        });
      });
      if (!claimed.count) continue; // A concurrent finalization already converted it to an asset.
      await ossDelete(row.key);
      await prisma.uploadReservation.deleteMany({ where: { key: row.key, userId } });
    } catch { /* Keep the reservation charged when storage cleanup cannot be confirmed. */ }
  }
}

/** All upload paths lock the same user row, so quota checks and reservations cannot race across instances. */
export async function reserveUpload(userId: string, mime: string, size: number) {
  await cleanAbandoned(userId);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const blocked = await uploadBlocked(userId, size, tx);
    if (blocked) throw new UploadError(blocked, 403);
    const pending = await tx.uploadReservation.count({ where: { userId } });
    if (pending >= 20) throw new UploadError(tk("未完成的上传过多，请稍后重试"), 429);
    return tx.uploadReservation.create({ data: {
      key: ossObjectKey(MEDIA_EXT[mime]), userId, size, mime,
      expiresAt: new Date(Date.now() + UPLOAD_TTL * 1000),
    } });
  });
}

/** Ownership comes from the reservation created before signing, never from a client-supplied object key. */
export async function finishUpload(userId: string, key: string, size: number, mime: string,
  source: string, dims?: { width: number; height: number }, direct = false) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const reserved = await tx.uploadReservation.findFirst({ where: { key, userId } });
    if (!reserved) {
      const existing = await tx.asset.findUnique({ where: { userId_key: { userId, key } } });
      if (existing) return existing;
      throw new UploadError(tk("上传凭证不存在或不属于当前账号"), 404);
    }
    if (reserved.state !== "pending") throw new UploadError(tk("上传凭证已过期"), 410);
    if (size !== reserved.size || mime !== reserved.mime) throw new UploadError(tk("文件与上传凭证不匹配"));
    const blocked = await uploadBlocked(userId, 0, tx);
    if (blocked) throw new UploadError(blocked, 403);
    const asset = await tx.asset.create({ data: {
      userId, key, url: ossUrlOf(key), size, mime, source, ...dims,
      uploadExpiresAt: direct ? reserved.expiresAt : null,
    } });
    await tx.uploadReservation.delete({ where: { key } });
    return asset;
  });
}

/** Server uploads can be cancelled immediately; no signed URL was given to the client. */
export async function cancelServerUpload(userId: string, key: string): Promise<void> {
  await ossDelete(key);
  await prisma.uploadReservation.deleteMany({ where: { key, userId } });
}

export function uploadCanBeDeleted(asset: { uploadExpiresAt?: Date | null }): boolean {
  return !asset.uploadExpiresAt || asset.uploadExpiresAt.getTime() <= Date.now();
}
