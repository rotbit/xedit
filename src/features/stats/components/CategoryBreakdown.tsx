"use client";

import { CAT_COLORS } from "../lib/format";
import type { Stats } from "../types";

/** 分类分布条 + 写作习惯洞察；两者都为空时整块不渲染 */
export function CategoryBreakdown({ stats }: { stats: Stats }) {
  const categories = stats.categories.slice(0, 6);
  const catTotal = stats.categories.reduce((s, c) => s + c.count, 0) || 1;
  const insights: string[] = [];
  if (stats.peakHour !== null) insights.push(`最常在 ${stats.peakHour} 点写作`);

  if (stats.categories.length === 0 && insights.length === 0) return null;

  return (
    <div
      className="rise mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      style={{ animationDelay: "0.2s" }}
    >
      {stats.categories.length > 0 ? (
        <>
          <p className="text-[11px] tracking-[0.3em] text-[var(--ink-faint)]">CATEGORIES</p>
          <div className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
            {categories.map((c, i) => (
              <div
                key={c.name}
                style={{
                  width: `${(c.count / catTotal) * 100}%`,
                  background: CAT_COLORS[i % CAT_COLORS.length],
                }}
                title={`${c.name} ${c.count} 篇`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {categories.map((c, i) => (
              <span
                key={c.name}
                className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-soft)]"
              >
                <span
                  className="h-2 w-2 rounded-[2px]"
                  style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}
                />
                {c.name} {c.count}
              </span>
            ))}
          </div>
        </>
      ) : null}
      {insights.length > 0 ? (
        <p
          className={`text-[12.5px] leading-6 text-[var(--ink-soft)] ${
            stats.categories.length > 0 ? "mt-4" : ""
          }`}
        >
          {insights.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
