import { prisma } from "@/lib/prisma";

/** 每篇文档最多保留的版本数，超出删除最旧的 */
const MAX_VERSIONS_PER_DOC = 100;

/** 自动留版的节流规则 */
export type AutoRule = {
  /** 距上一个版本至少这么久，才值得再留一版 */
  minIntervalMs: number;
  /** 且与上一个版本的改动量要达到这个字数 */
  minChars: number;
};

/** 自动保存触发：写作过程中每隔一段时间把当前内容定格一版 */
export const AUTOSAVE_RULE: AutoRule = { minIntervalMs: 10 * 60_000, minChars: 20 };
/** 停笔 / 离开页面触发：把这一段写作的最终状态定格下来，只做轻度节流 */
export const IDLE_RULE: AutoRule = { minIntervalMs: 60_000, minChars: 20 };

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

/** 改动规模：去掉公共前后缀后剩下的字数，比单纯比长度更能识别「原地改写」 */
function changedChars(a: string, b: string): number {
  const min = Math.min(a.length, b.length);
  let head = 0;
  while (head < min && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < min - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  return Math.max(a.length, b.length) - head - tail;
}

async function createVersion(
  documentId: string,
  title: string,
  content: string,
  kind: "auto" | "manual" | "restore"
): Promise<boolean> {
  await prisma.documentVersion.create({ data: { documentId, title, content, kind } });
  await pruneVersions(documentId);
  return true;
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
  return createVersion(documentId, title, content, kind);
}

/**
 * 自动留版：文档还没有任何版本时先留个底；之后按「间隔 + 改动量」节流。
 * 先只查最近版本的时间（走索引、不读正文），到点了才拉正文比对改动量，
 * 这样每次自动保存的额外开销可以忽略。
 */
export async function autoSnapshot(
  documentId: string,
  title: string,
  content: string,
  rule: AutoRule
): Promise<boolean> {
  if (!content.trim()) return false;
  const latest = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
  if (!latest) return createVersion(documentId, title, content, "auto");
  if (Date.now() - latest.createdAt.getTime() < rule.minIntervalMs) return false;

  const prev = await prisma.documentVersion.findUnique({
    where: { id: latest.id },
    select: { content: true },
  });
  if (prev && changedChars(prev.content, content) < rule.minChars) return false;
  return createVersion(documentId, title, content, "auto");
}
