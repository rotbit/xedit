"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Gran = "day" | "week" | "month";
interface Point {
  key: string;
  count: number;
}

const TABS: { key: Gran; label: string; hint: string }[] = [
  { key: "day", label: "按天", hint: "近 30 天" },
  { key: "week", label: "按周", hint: "近 12 周" },
  { key: "month", label: "按月", hint: "近 12 个月" },
];

/** 画布尺寸与内边距（viewBox 坐标系，等比缩放到容器宽度） */
const W = 640;
const H = 200;
const PAD = { top: 14, right: 12, bottom: 24, left: 34 };

function tooltipLabel(gran: Gran, key: string): string {
  if (gran === "month") return `${key.slice(0, 4)} 年 ${Number(key.slice(5))} 月`;
  const text = `${Number(key.slice(5, 7))} 月 ${Number(key.slice(8))} 日`;
  return gran === "week" ? `${text}起一周` : text;
}

function axisLabel(gran: Gran, key: string): string {
  return gran === "month" ? `${Number(key.slice(5))}月` : key.slice(5);
}

/** 活跃用户曲线：单序列面积折线，悬停出十字线与数值气泡 */
export function DauChart() {
  const [gran, setGran] = useState<Gran>("day");
  // 各粒度各缓存一份，切换不闪加载
  const [cache, setCache] = useState<Partial<Record<Gran, Point[]>>>({});
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (cache[gran]) return;
    let cancelled = false;
    void fetch(`/api/admin/dau?g=${gran}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.points) {
          setCache((prev) => ({ ...prev, [gran]: data.points }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gran, cache]);

  const points = cache[gran];
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // y 轴取整到 4 的倍数，保证 0 / 中值 / 顶值三条刻度都是整数
  const maxCount = points ? Math.max(1, ...points.map((p) => p.count)) : 1;
  const yMax = Math.max(4, Math.ceil(maxCount / 4) * 4);

  const xOf = (i: number): number =>
    PAD.left + (points && points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2);
  const yOf = (count: number): number => PAD.top + innerH - (count / yMax) * innerH;

  const linePath = points
    ? points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(p.count).toFixed(1)}`).join("")
    : "";
  const areaPath = points
    ? `${linePath}L${xOf(points.length - 1).toFixed(1)},${PAD.top + innerH}L${xOf(0).toFixed(1)},${PAD.top + innerH}Z`
    : "";

  // x 轴稀疏刻度：首、末与中间约 3 个
  const xTicks = points
    ? Array.from(new Set([0, 1, 2, 3, 4].map((k) => Math.round((k * (points.length - 1)) / 4))))
    : [];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!points || points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = (x - PAD.left) / innerW;
    const i = Math.round(ratio * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  const hovered = points && hover !== null ? points[hover] : null;

  return (
    <div className="mt-3 rounded-xl border border-[var(--hairline)] bg-[var(--panel)] px-4 py-3.5">
      <div className="flex items-center gap-2">
        <p className="text-[13px] font-medium text-[var(--ink)]">活跃用户</p>
        <p className="text-[11.5px] text-[var(--ink-faint)]">
          {TABS.find((t) => t.key === gran)?.hint} · 当日有访问即计入
        </p>
        <span className="flex-1" />
        <div className="flex rounded-lg border border-[var(--hairline)] p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`h-6 cursor-pointer rounded-md px-2.5 text-[12px] transition-colors ${
                gran === t.key
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
              onClick={() => {
                setGran(t.key);
                setHover(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {!points ? (
        <div className="flex h-[180px] items-center justify-center gap-2 text-[13px] text-[var(--ink-faint)]">
          <Loader2 size={15} className="animate-spin" /> 加载中…
        </div>
      ) : (
        <div className="relative mt-2">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block w-full"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            {/* 横向网格与 y 刻度（0 / 中 / 顶），保持退后 */}
            {[0, yMax / 2, yMax].map((v) => (
              <g key={v}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={yOf(v)}
                  y2={yOf(v)}
                  stroke="var(--hairline)"
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 7}
                  y={yOf(v) + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--ink-faint)"
                >
                  {v}
                </text>
              </g>
            ))}
            {/* x 刻度 */}
            {xTicks.map((i) => (
              <text
                key={i}
                x={xOf(i)}
                y={H - 8}
                textAnchor="middle"
                fontSize="10"
                fill="var(--ink-faint)"
              >
                {axisLabel(gran, points[i].key)}
              </text>
            ))}
            <path d={areaPath} fill="var(--accent)" fillOpacity="0.07" />
            <path
              d={linePath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* 悬停：十字线 + 带底色描边的标记点 */}
            {hovered && hover !== null ? (
              <g>
                <line
                  x1={xOf(hover)}
                  x2={xOf(hover)}
                  y1={PAD.top}
                  y2={PAD.top + innerH}
                  stroke="var(--hairline-strong)"
                  strokeWidth="1"
                />
                <circle
                  cx={xOf(hover)}
                  cy={yOf(hovered.count)}
                  r="4"
                  fill="var(--accent)"
                  stroke="var(--panel)"
                  strokeWidth="2"
                />
              </g>
            ) : null}
          </svg>
          {hovered && hover !== null ? (
            <div
              className="pointer-events-none absolute -translate-x-1/2 rounded-md bg-[var(--ink)] px-2.5 py-1 text-[11.5px] whitespace-nowrap text-[var(--paper)] shadow-[0_4px_14px_rgba(0,0,0,0.25)]"
              style={{
                left: `${(xOf(hover) / W) * 100}%`,
                top: `calc(${(yOf(hovered.count) / H) * 100}% - 34px)`,
              }}
            >
              {tooltipLabel(gran, hovered.key)} · {hovered.count} 人
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
