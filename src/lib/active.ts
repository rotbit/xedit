import { prisma } from "@/lib/prisma";

/** UTC+8 date string YYYY-MM-DD (same convention as WritingActivity) */
export function chinaDate(now = Date.now()): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

// In-process dedup: at most one DB write per user per day, all cleared when the day changes
let markedDate = "";
const marked = new Set<string>();

/** Record that the user was active today; failures don't affect anything, so callers can fire-and-forget */
export async function touchDailyActive(userId: string): Promise<void> {
  const date = chinaDate();
  if (date !== markedDate) {
    markedDate = date;
    marked.clear();
  }
  if (marked.has(userId)) return;
  marked.add(userId);
  try {
    await prisma.dailyActive.createMany({ data: [{ userId, date }], skipDuplicates: true });
  } catch {
    // On write failure (e.g. the account was just deleted) clear the mark so the next call can retry
    marked.delete(userId);
  }
}
