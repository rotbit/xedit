import { prisma } from "@/lib/prisma";

/** 停止编辑多久后，把当前内容定格为一个版本 */
export const IDLE_VERSION_MS = 5 * 60_000;
/** 每篇文档最多保留的版本数，超出删除最旧的 */
const MAX_VERSIONS_PER_DOC = 100;

export async function pruneVersions(documentId: string): Promise<void> {
  const extras = await prisma.documentVersion.findMany({
    where: { documentId },
    orderBy: { createdAt: "desc" },
    skip: MAX_VERSIONS_PER_DOC,
    select: { id: true },
  });
  if (extras.length > 0) {
    await prisma.documentVersion.deleteMany({
      where: { id: { in: extras.map((e) => e.id) } },
    });
  }
}

/**
 * 留存一个版本快照；与最近版本内容相同时跳过（去重）。
 * 返回是否真正创建了新版本。
 */
export async function snapshot(
  documentId: string,
  title: string,
  content: string,
  kind: "auto" | "manual" | "restore"
): Promise<boolean> {
  if (!content.trim()) return false;
  const latest = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });
  if (latest && latest.content === content) return false;

  await prisma.documentVersion.create({
    data: { documentId, title, content, kind },
  });
  await pruneVersions(documentId);
  return true;
}
