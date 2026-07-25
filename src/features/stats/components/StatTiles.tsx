"use client";

import { FileText, Type, TrendingUp, AlignLeft } from "lucide-react";
import { formatNumber } from "../lib/format";
import type { Stats } from "../types";

/** 指标行：篇数 / 本月新增 / 平均每篇 / 最长一篇 */
export function StatTiles({ stats }: { stats: Stats }) {
  const tiles = [
    { icon: FileText, label: "文章", value: `${stats.totalDocs} 篇` },
    { icon: TrendingUp, label: "本月新增", value: `${formatNumber(stats.monthChars)} 字` },
    { icon: Type, label: "平均每篇", value: `${formatNumber(stats.avgChars)} 字` },
    {
      icon: AlignLeft,
      label: "最长一篇",
      value: stats.longest ? `${formatNumber(stats.longest.chars)} 字` : "—",
      sub: stats.longest?.title,
    },
  ];

  return (
    <div
      className="rise mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
      style={{ animationDelay: "0.05s" }}
    >
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-xl border border-[var(--hairline)] bg-[var(--panel)] px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          <p className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-faint)]">
            <t.icon size={12} />
            {t.label}
          </p>
          <p className="mt-1.5 truncate text-[20px] font-semibold leading-none [font-family:var(--serif)]">
            {t.value}
          </p>
          {t.sub ? (
            <p className="mt-1 truncate text-[11px] text-[var(--ink-faint)]" title={t.sub}>
              《{t.sub}》
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
