import { prisma } from "@/lib/prisma";

/** Max versions kept per document; the oldest are deleted beyond that */
const MAX_VERSIONS_PER_DOC = 100;

/** Throttling rules for automatic versions */
export type AutoRule = {
  /** Minimum time since the last version before another is worth keeping */
  minIntervalMs: number;
  /** And the change since the last version must reach this many characters */
  minChars: number;
};

/** Autosave trigger: snapshot the current content at intervals while writing */
export const AUTOSAVE_RULE: AutoRule = { minIntervalMs: 10 * 60_000, minChars: 20 };
/** Pause / leaving the page trigger: capture the final state of this writing session, with only light throttling */
export const IDLE_RULE: AutoRule = { minIntervalMs: 60_000, minChars: 20 };

export async function pruneVersions(documentId: string): Promise<void> {
  // The vast majority of docs never reach the limit, yet this runs on every version saved.
  // count first (index only, no rows); if under the limit stop here, no need to page through the ones to delete
  const total = await prisma.documentVersion.count({ where: { documentId } });
  if (total <= MAX_VERSIONS_PER_DOC) return;
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

/** Change size: characters remaining after removing the common prefix and suffix; better at spotting in-place rewrites than comparing lengths */
function changedChars(a: string, b: string): number {
  const min = Math.min(a.length, b.length);
  let head = 0;
  while (head < min && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < min - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  return Math.max(a.length, b.length) - head - tail;
}

/** Unconditionally create a version and prune; dedupe/throttling is decided by the caller, so this never "fails to create" */
async function createVersion(
  documentId: string,
  title: string,
  content: string,
  kind: "auto" | "manual" | "restore"
): Promise<void> {
  await prisma.documentVersion.create({ data: { documentId, title, content, kind } });
  await pruneVersions(documentId);
}

/**
 * Save a version snapshot; skipped if identical to the latest version (dedupe).
 * Returns whether a new version was actually created.
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
  await createVersion(documentId, title, content, kind);
  return true;
}

/**
 * Automatic versioning: if the doc has no versions yet, save a baseline; after that, throttle by interval + change size.
 * Query only the latest version's time first (index, no body), and fetch the body to measure changes only when the interval has passed,
 * so the extra cost per autosave is negligible.
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
  if (!latest) {
    await createVersion(documentId, title, content, "auto");
    return true;
  }
  if (Date.now() - latest.createdAt.getTime() < rule.minIntervalMs) return false;

  const prev = await prisma.documentVersion.findUnique({
    where: { id: latest.id },
    select: { content: true },
  });
  if (prev && changedChars(prev.content, content) < rule.minChars) return false;
  await createVersion(documentId, title, content, "auto");
  return true;
}
