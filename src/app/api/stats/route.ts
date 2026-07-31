import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeDecay } from "@/lib/level";
import { wordCount } from "@/lib/wordCount";

const DAYS = 84; // 12 周热力图

function chinaDateStr(d: Date): string {
  return new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const userId = session.user.id;

  const [docs, activities, versions] = await Promise.all([
    prisma.document.findMany({
      where: { userId, deletedAt: null },
      select: { title: true, category: true, content: true },
    }),
    prisma.writingActivity.findMany({ where: { userId } }),
    prisma.documentVersion.findMany({
      where: { document: { userId, deletedAt: null } },
      select: { createdAt: true },
    }),
  ]);

  // 文章与字数
  const charsOf = wordCount;
  const totalDocs = docs.length;
  const totalChars = docs.reduce((sum, d) => sum + charsOf(d.content), 0);
  const avgChars = totalDocs ? Math.round(totalChars / totalDocs) : 0;
  let longest: { title: string; chars: number } | null = null;
  for (const d of docs) {
    const c = charsOf(d.content);
    if (!longest || c > longest.chars) longest = { title: d.title, chars: c };
  }

  // 分类分布
  const catMap = new Map<string, number>();
  for (const d of docs) {
    const c = d.category || "未分类";
    catMap.set(c, (catMap.get(c) ?? 0) + 1);
  }
  const categories = Array.from(catMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // 活跃日期集合：流水表为主，版本时间兜底（老数据回填）
  const activityByDate = new Map<string, number>();
  for (const a of activities) {
    activityByDate.set(a.date, (activityByDate.get(a.date) ?? 0) + a.charsAdded);
  }
  const activeDates = new Set<string>(activities.map((a) => a.date));
  for (const v of versions) {
    const d = chinaDateStr(v.createdAt);
    activeDates.add(d);
    if (!activityByDate.has(d)) activityByDate.set(d, 0);
  }

  // 热力图：近 84 天
  const heatmap: { date: string; chars: number; active: boolean }[] = [];
  const now = Date.now();
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = chinaDateStr(new Date(now - i * 86400_000));
    heatmap.push({
      date,
      chars: activityByDate.get(date) ?? 0,
      active: activeDates.has(date),
    });
  }

  // 连续写作天数（今天没写则从昨天起算）
  let streak = 0;
  let cursor = now;
  if (!activeDates.has(chinaDateStr(new Date(now)))) cursor -= 86400_000;
  while (activeDates.has(chinaDateStr(new Date(cursor)))) {
    streak += 1;
    cursor -= 86400_000;
  }

  // 本月新增字数（仅流水表，精确值）
  const monthPrefix = chinaDateStr(new Date(now)).slice(0, 7);
  const monthChars = activities
    .filter((a) => a.date.startsWith(monthPrefix))
    .reduce((sum, a) => sum + a.charsAdded, 0);

  // 怠惰衰减：距上次动笔的天数 → 墨力流失（等级依据墨力而非累计字数）
  let daysSinceActive: number | null = null;
  if (activeDates.size > 0) {
    for (let i = 0; i < 3650; i++) {
      if (activeDates.has(chinaDateStr(new Date(now - i * 86400_000)))) {
        daysSinceActive = i;
        break;
      }
    }
  }
  const decay = computeDecay(daysSinceActive);
  const effectiveChars = Math.max(0, totalChars - decay);

  // 写作时段（版本创建时间的众数小时，东八区）
  const hourCount = new Array(24).fill(0) as number[];
  for (const v of versions) {
    hourCount[(v.createdAt.getUTCHours() + 8) % 24] += 1;
  }
  const maxHour = Math.max(...hourCount);
  const peakHour = maxHour > 0 ? hourCount.indexOf(maxHour) : null;

  return NextResponse.json({
    totalDocs,
    totalChars,
    effectiveChars,
    decay,
    daysSinceActive,
    monthChars,
    streak,
    avgChars,
    longest,
    categories,
    heatmap,
    peakHour,
  });
}
