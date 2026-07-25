"use client";

import { firstWeekdayOffset, formatNumber } from "../lib/format";
import type { HeatmapData } from "../types";

const H = 128;
const TOP = 16; // 与热力图月份标签行对齐
const BASE = H - 3;

interface Week {
  chars: number;
  days: number;
  start: string;
  end: string;
}

/** 与热力图同口径（自然周，周一起算）把日数据聚合成周 */
function toWeeks(data: HeatmapData): Week[] {
  const firstOffset = firstWeekdayOffset(data[0].date);
  const weeks: Week[] = [];
  data.forEach((d, i) => {
    const w = Math.floor((firstOffset + i) / 7);
    if (!weeks[w]) weeks[w] = { chars: 0, days: 0, start: d.date, end: d.date };
    weeks[w].chars += d.chars;
    if (d.active) weeks[w].days += 1;
    weeks[w].end = d.date;
  });
  return weeks;
}

/** 本周与上周的环比描述，接在「本周 N 字」之后 */
function weekOverWeek(weeks: Week[]): string {
  const n = weeks.length;
  const thisWeek = weeks[n - 1]?.chars ?? 0;
  const lastWeek = weeks[n - 2]?.chars ?? 0;
  const delta = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
  if (delta === null) return thisWeek > 0 && lastWeek === 0 ? "，上周未动笔" : "";
  if (delta === 0) return "，与上周持平";
  return `，较上周${delta > 0 ? "多" : "少"} ${Math.abs(delta)}%`;
}

const fmtDay = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;

/** 近 12 周字数趋势条形图 */
export function TrendChart({ data }: { data: HeatmapData }) {
  const weeks = toWeeks(data);
  const max = Math.max(...weeks.map((w) => w.chars), 1);
  const n = weeks.length;
  const slot = 100 / n;
  const barPct = slot * 0.62;
  const thisWeek = weeks[n - 1]?.chars ?? 0;

  return (
    <>
      <svg className="w-full" height={H} role="img" aria-label="每周字数趋势">
        <line x1="0" y1={BASE + 0.5} x2="100%" y2={BASE + 0.5} stroke="var(--hairline)" />
        {weeks.map((w, i) => {
          const h = w.chars > 0 ? Math.max(4, Math.round(((BASE - TOP) * w.chars) / max)) : 3;
          return (
            <rect
              key={w.start}
              x={`${i * slot + (slot - barPct) / 2}%`}
              y={BASE - h}
              width={`${barPct}%`}
              height={h}
              rx={2.5}
              fill={w.chars > 0 ? "var(--heat-4)" : "var(--heat-0)"}
            >
              <title>
                {fmtDay(w.start)} – {fmtDay(w.end)} ·{" "}
                {w.chars > 0 ? `${w.chars} 字 · 动笔 ${w.days} 天` : "未写作"}
              </title>
            </rect>
          );
        })}
      </svg>
      <p className="mt-1.5 text-[11px] text-[var(--ink-faint)]">
        每周字数 · 本周 {formatNumber(thisWeek)} 字{weekOverWeek(weeks)}
      </p>
    </>
  );
}
