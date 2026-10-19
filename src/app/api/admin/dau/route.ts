import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { adminSessionUserId } from "@/lib/admin";
import { chinaDate } from "@/lib/active";
import { tk } from "@/i18n/t";

/** Active-user curve data: g=day last 30 days / g=week last 12 weeks / g=month last 12 months, gaps zero-filled */

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing this date (key for the weekly bucket) */
function mondayOf(date: string): string {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return shiftDate(date, -dow);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!adminSessionUserId(session)) {
    return NextResponse.json({ error: tk("无权访问") }, { status: 403 });
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

  // (userId, date) is unique, so row count = active user-days; week/month buckets dedupe in memory
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
