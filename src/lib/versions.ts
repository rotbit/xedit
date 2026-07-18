import { prisma } from "@/lib/prisma";

/** 自动版本留存间隔：距上一版本超过该时长才新建快照 */
const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60_000;
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
 * 自动保存时调用：若距最近一次快照超过间隔（或还没有快照）则留存新版本。
 * 返回是否创建了新版本。
 */
export async function maybeSnapshot(
  documentId: string,
  title: string,
  content: string
): Promise<boolean> {
  const latest = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, content: true },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < AUTO_SNAPSHOT_INTERVAL_MS) {
    return false;
  }
  if (latest && latest.content === content) return false;

  await prisma.documentVersion.create({
    data: { documentId, title, content, kind: "auto" },
  });
  await pruneVersions(documentId);
  return true;
}
