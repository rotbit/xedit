"use client";

import { Heatmap } from "./Heatmap";
import { TrendChart } from "./TrendChart";
import type { HeatmapData } from "../types";

/** 活动面板：左热力图、右周趋势，共用同一份日粒度数据 */
export function ActivityPanel({ data }: { data: HeatmapData }) {
  return (
    <div
      className="rise mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      style={{ animationDelay: "0.15s" }}
    >
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="shrink-0">
          <p className="text-[11px] tracking-[0.3em] text-[var(--ink-faint)]">ACTIVITY</p>
          <div className="mt-3 overflow-x-auto">
            <Heatmap data={data} />
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--ink-faint)]">
            最近 12 周 · 颜色越深当天写得越多
          </p>
        </div>
        <div className="min-w-0 flex-1 border-t border-[var(--hairline)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="text-[11px] tracking-[0.3em] text-[var(--ink-faint)]">TREND</p>
          <div className="mt-3">
            <TrendChart data={data} />
          </div>
        </div>
      </div>
    </div>
  );
}
