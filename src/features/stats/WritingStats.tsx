"use client";

import { Loader2 } from "lucide-react";
import { ActivityPanel } from "./components/ActivityPanel";
import { CategoryBreakdown } from "./components/CategoryBreakdown";
import { DailyGoalCard } from "./components/DailyGoalCard";
import { LevelPanel } from "./components/LevelPanel";
import { StatTiles } from "./components/StatTiles";
import { useStats } from "./hooks/useStats";

/** 写作足迹页：养成面板 + 指标行 + 活动图表 + 分类分布 */
export function WritingStats() {
  const stats = useStats();

  if (!stats) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-[var(--ink-faint)]">
        <Loader2 size={16} className="animate-spin" /> 加载中…
      </div>
    );
  }

  return (
    <div>
      <div className="rise grid grid-cols-1 gap-4 lg:grid-cols-[1fr_264px]">
        <LevelPanel stats={stats} />
        <DailyGoalCard stats={stats} />
      </div>
      <StatTiles stats={stats} />
      <ActivityPanel data={stats.heatmap} />
      <CategoryBreakdown stats={stats} />
    </div>
  );
}
