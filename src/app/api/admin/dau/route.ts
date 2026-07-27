import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { adminSessionUserId } from "@/lib/admin";
import { chinaDate } from "@/lib/active";

/** 活跃用户曲线数据：g=day 近 30 天 / g=week 近 12 周 / g=month 近 12 个月，缺口补零 */

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 该日期所在周的周一（周作为聚合桶的 key） */
function mondayOf(date: string): string {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return shiftDate(date, -dow);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!adminSessionUserId(session)) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const g = new URL(req.url).searchParams.get("g");
  const gran = g === "week" || g === "month" ? g : "day";
  const today = chinaDate();

  let buckets: string[];
  if (gran === "day") {
    buckets = Array.from({ length: 30 }, (_, i) => shiftDate(today, i - 29));
  } else if (gran === "week") {
    const monday = mondayOf(today);
    buckets = Array.from({ length: 12 }, (_, i) => shiftDate(monday, (i - 11) * 7));
  } else {
    const months = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1;
    buckets = Array.from({ length: 12 }, (_, i) => {
      const m = months - (11 - i);
      return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
    });
  }

  // (userId, date) 唯一，量级 = 活跃人天；周/月桶在内存里去重即可
  const start = gran === "month" ? `${buckets[0]}-01` : buckets[0];
  const rows = await prisma.dailyActive.findMany({
    where: { date: { gte: start, lte: today } },
    select: { userId: true, date: true },
  });

  const perBucket = new Map<string, Set<string>>(buckets.map((b) => [b, new Set()]));
  for (const r of rows) {
    const key =
      gran === "day" ? r.date : gran === "week" ? mondayOf(r.date) : r.date.slice(0, 7);
    perBucket.get(key)?.add(r.userId);
  }

  return NextResponse.json({
    granularity: gran,
    points: buckets.map((b) => ({ key: b, count: perBucket.get(b)?.size ?? 0 })),
  });
}
