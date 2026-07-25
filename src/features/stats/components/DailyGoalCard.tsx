"use client";

import { Flame } from "lucide-react";
import { DECAY_GRACE_DAYS, DECAY_PER_DAY } from "@/lib/level";
import { useDailyGoal } from "../hooks/useDailyGoal";
import { formatNumber } from "../lib/format";
import type { Stats } from "../types";

const RING_R = 40;
const RING_C = 2 * Math.PI * RING_R;

/** 今日修行：目标完成度圆环 + 连续动笔天数 */
export function DailyGoalCard({ stats }: { stats: Stats }) {
  const { dailyGoal, cycleGoal } = useDailyGoal();
  const todayChars = stats.heatmap[stats.heatmap.length - 1]?.chars ?? 0;
  const goalPct = Math.min(1, todayChars / dailyGoal);
  const goalDone = todayChars >= dailyGoal;

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="relative h-[104px] w-[104px]">
        <svg width={104} height={104} className="-rotate-90">
          <circle cx={52} cy={52} r={RING_R} fill="none" stroke="var(--hairline)" strokeWidth={8} />
          <circle
            cx={52}
            cy={52}
            r={RING_R}
            fill="none"
            stroke="var(--seal)"
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - goalPct)}
            className="transition-[stroke-dashoffset] duration-700"
          />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          {goalDone ? (
            <span className="rotate-[-8deg] rounded-md bg-[var(--seal)] px-1.5 py-0.5 text-[12px] font-bold text-white [font-family:var(--serif)]">
              达标
            </span>
          ) : (
            <span className="text-[20px] font-bold leading-none [font-family:var(--serif)]">
              {Math.round(goalPct * 100)}%
            </span>
          )}
        </span>
      </div>
      <p className="mt-2.5 text-[13px] text-[var(--ink)]">
        今日 {formatNumber(todayChars)} /{" "}
        <button
          className="cursor-pointer rounded px-0.5 font-medium text-[var(--seal)] underline decoration-dotted underline-offset-2 hover:bg-[var(--seal-wash)]"
          onClick={cycleGoal}
          title="点击切换每日目标"
        >
          {formatNumber(dailyGoal)}
        </button>{" "}
        字
      </p>
      <div
        className={`mt-2.5 flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] ${
          stats.streak >= 3
            ? "bg-[var(--seal)] text-white shadow-[0_2px_8px_rgba(192,57,43,0.3)]"
            : "border border-[var(--hairline-strong)] text-[var(--ink-soft)]"
        }`}
      >
        <Flame size={12} className={stats.streak >= 3 ? "" : "text-[var(--ink-faint)]"} />
        {stats.streak > 0 ? `连续 ${stats.streak} 天` : "今天还没动笔"}
      </div>
      <p className="mt-2.5 text-center text-[10.5px] leading-4 text-[var(--ink-faint)]">
        连续 {DECAY_GRACE_DAYS} 天不动笔，墨力每天流失 {DECAY_PER_DAY} 字
      </p>
    </div>
  );
}
