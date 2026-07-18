"use client";

import { useEffect, useState } from "react";
import { Flame, FileText, Type, TrendingUp, Loader2 } from "lucide-react";

interface Stats {
  totalDocs: number;
  totalChars: number;
  monthChars: number;
  streak: number;
  avgChars: number;
  longest: { title: string; chars: number } | null;
  categories: { name: string; count: number }[];
  heatmap: { date: string; chars: number; active: boolean }[];
  peakHour: number | null;
}

function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  return String(n);
}

/** 热力色阶：未活跃 → 字数越多越深 */
function cellColor(cell: { chars: number; active: boolean }): string {
  if (!cell.active) return "#efe9e2";
  if (cell.chars <= 0) return "#f3d9d4";
  if (cell.chars < 300) return "#eab5aa";
  if (cell.chars < 1000) return "#dd8672";
  if (cell.chars < 3000) return "#cd5a41";
  return "#b03c26";
}

const CAT_COLORS = ["#c0392b", "#1e6bb8", "#0e9285", "#d4881f", "#8e44ad", "#576b95"];

function Heatmap({ data }: { data: Stats["heatmap"] }) {
  // 按周分列（列 = 周，行 = 周一到周日）
  const cell = 13;
  const gap = 3;
  const first = new Date(data[0].date);
  // getDay: 0=周日 → 转成 0=周一
  const firstOffset = (first.getDay() + 6) % 7;
  const weeks = Math.ceil((firstOffset + data.length) / 7);

  const monthLabels: { x: number; text: string }[] = [];
  let lastMonth = "";
  let lastCol = -3;
  data.forEach((d, i) => {
    const month = d.date.slice(5, 7);
    if (month !== lastMonth) {
      lastMonth = month;
      const col = Math.floor((firstOffset + i) / 7);
      if (col - lastCol >= 2) {
        monthLabels.push({ x: col * (cell + gap), text: `${Number(month)}月` });
        lastCol = col;
      }
    }
  });

  return (
    <svg
      width={weeks * (cell + gap)}
      height={7 * (cell + gap) + 16}
      className="shrink-0"
      role="img"
      aria-label="写作热力图"
    >
      {monthLabels.map((m, i) => (
        <text key={i} x={m.x} y={10} fontSize={9} fill="var(--ink-faint)">
          {m.text}
        </text>
      ))}
      {data.map((d, i) => {
        const idx = firstOffset + i;
        const col = Math.floor(idx / 7);
        const row = idx % 7;
        return (
          <rect
            key={d.date}
            x={col * (cell + gap)}
            y={16 + row * (cell + gap)}
            width={cell}
            height={cell}
            rx={3}
            fill={cellColor(d)}
          >
            <title>
              {d.date} · {d.active ? `${d.chars} 字` : "未写作"}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

export function WritingStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!cancelled && s) setStats(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-[var(--ink-faint)]">
        <Loader2 size={16} className="animate-spin" /> 加载中…
      </div>
    );
  }

  const cards = [
    { icon: FileText, label: "文章", value: String(stats.totalDocs) },
    { icon: Type, label: "总字数", value: formatNumber(stats.totalChars) },
    { icon: TrendingUp, label: "本月新增", value: formatNumber(stats.monthChars) },
    { icon: Flame, label: "连续写作", value: `${stats.streak} 天`, hot: stats.streak >= 3 },
  ];

  const catTotal = stats.categories.reduce((s, c) => s + c.count, 0) || 1;
  const insights: string[] = [];
  if (stats.peakHour !== null) insights.push(`最常在 ${stats.peakHour} 点写作`);
  if (stats.longest && stats.longest.chars > 0)
    insights.push(`最长一篇《${stats.longest.title}》${formatNumber(stats.longest.chars)} 字`);
  if (stats.avgChars > 0) insights.push(`平均 ${formatNumber(stats.avgChars)} 字/篇`);

  return (
    <div>
      {/* 统计卡 */}
      <div className="rise grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-[var(--hairline)] bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(60,50,30,0.04)]"
          >
            <p className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-faint)]">
              <c.icon size={12} className={c.hot ? "text-[var(--accent)]" : ""} />
              {c.label}
            </p>
            <p
              className={`mt-1.5 text-[24px] font-semibold leading-none [font-family:var(--serif)] ${
                c.hot ? "text-[var(--accent)]" : "text-[var(--ink)]"
              }`}
            >
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* 热力图 */}
      <div
        className="rise mt-4 rounded-xl border border-[var(--hairline)] bg-white p-5 shadow-[0_1px_3px_rgba(60,50,30,0.04)]"
        style={{ animationDelay: "0.05s" }}
      >
        <p className="text-[11px] tracking-[0.3em] text-[var(--ink-faint)]">ACTIVITY</p>
        <div className="mt-3 overflow-x-auto">
          <Heatmap data={stats.heatmap} />
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--ink-faint)]">
          最近 12 周 · 颜色越深当天写得越多
        </p>
      </div>

      {/* 分类分布 + 洞察 */}
      {stats.categories.length > 0 || insights.length > 0 ? (
        <div
          className="rise mt-4 rounded-xl border border-[var(--hairline)] bg-white p-5 shadow-[0_1px_3px_rgba(60,50,30,0.04)]"
          style={{ animationDelay: "0.1s" }}
        >
          {stats.categories.length > 0 ? (
            <>
              <p className="text-[11px] tracking-[0.3em] text-[var(--ink-faint)]">CATEGORIES</p>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
                {stats.categories.slice(0, 6).map((c, i) => (
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
                {stats.categories.slice(0, 6).map((c, i) => (
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
      ) : null}
    </div>
  );
}
