import { prisma } from "@/lib/prisma";

/** 东八区日期串 YYYY-MM-DD（与 WritingActivity 同一口径） */
export function chinaDate(now = Date.now()): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

// 进程内去重：每个用户每天最多写一次库，跨天整体作废
let markedDate = "";
const marked = new Set<string>();

/** 记一笔「今天活跃过」；打点失败不影响业务，调用处 fire-and-forget 即可 */
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
    // 写失败（如账号刚被删除）撤掉标记，允许下次重试
    marked.delete(userId);
  }
}
