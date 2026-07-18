"use client";

import { useEffect, useState } from "react";
import { Flame, FileText, Type, TrendingUp, Loader2, AlignLeft } from "lucide-react";

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

/** 热力色阶：未活跃 → 字数越多越深（色值随日夜模式切换） */
function cellColor(cell: { chars: number; active: boolean }): string {
  if (!cell.active) return "var(--heat-0)";
  if (cell.chars <= 0) return "var(--heat-1)";
  if (cell.chars < 300) return "var(--heat-2)";
  if (cell.chars < 1000) return "var(--heat-3)";
  if (cell.chars < 3000) return "var(--heat-4)";
  return "var(--heat-5)";
}

const CAT_COLORS = [
  "var(--cat-1)",
  "var(--cat-2)",
  "var(--cat-3)",
  "var(--cat-4)",
  "var(--cat-5)",
  "var(--cat-6)",
];

/** 数字滚动：ease-out，落定在真实值 */
function useCountUp(target: number, ms = 900): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

/** 累计字数的叙事化参照 */
function narrative(chars: number): string {
  if (chars >= 120_000) return `体量已达 ${(chars / 120_000).toFixed(1)} 部《活着》`;
  if (chars >= 60_000) return `相当于 ${(chars / 60_000).toFixed(1)} 本《边城》`;
  if (chars >= 26_000) return "已超过一部《阿 Q 正传》的篇幅";
  if (chars >= 8_000) return "相当于一篇本科毕业论文";
  if (chars >= 2_000) return "已是一篇扎实的深度长文";
  if (chars > 0) return "每一个字，都算数";
  return "落笔，即是开始";
}

/** 成就印章：达成条件全部由现有统计推得 */
const SEALS = [
  { char: "启", name: "开笔", desc: "写下第一篇文章", earned: (s: Stats) => s.totalDocs >= 1 },
  { char: "耕", name: "笔耕", desc: "累计 10 篇文章", earned: (s: Stats) => s.totalDocs >= 10 },
  { char: "万", name: "万言", desc: "累计写满一万字", earned: (s: Stats) => s.totalChars >= 10_000 },
  {
    char: "著",
    name: "著述",
    desc: "累计写满十万字",
    earned: (s: Stats) => s.totalChars >= 100_000,
  },
  { char: "恒", name: "有恒", desc: "连续写作 3 天", earned: (s: Stats) => s.streak >= 3 },
  { char: "毅", name: "不辍", desc: "连续写作 7 天", earned: (s: Stats) => s.streak >= 7 },
  {
    char: "鸿",
    name: "鸿篇",
    desc: "单篇超过 3000 字",
    earned: (s: Stats) => (s.longest?.chars ?? 0) >= 3000,
  },
  {
    char: "集",
    name: "文集",
    desc: "文章分作 3 个门类",
    earned: (s: Stats) => s.categories.length >= 3,
  },
];

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

  const animated = useCountUp(stats?.totalChars ?? 0);

  if (!stats) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-[var(--ink-faint)]">
        <Loader2 size={16} className="animate-spin" /> 加载中…
      </div>
    );
  }

  const big =
    stats.totalChars >= 10000
      ? { num: (animated / 10000).toFixed(1), unit: "万字" }
      : { num: String(animated), unit: "字" };

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

  const earnedCount = SEALS.filter((s) => s.earned(stats)).length;
  const catTotal = stats.categories.reduce((s, c) => s + c.count, 0) || 1;
  const insights: string[] = [];
  if (stats.peakHour !== null) insights.push(`最常在 ${stats.peakHour} 点写作`);

  return (
    <div>
      {/* 主视觉：累计字数 + 连续写作 */}
      <div
        className="rise relative overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-6 shadow-[0_1px_3px_rgba(60,50,30,0.04)]"
        style={{
          backgroundImage:
            "radial-gradient(120% 180% at 88% -30%, var(--accent-wash), transparent 55%)",
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div>
            <p className="text-[11px] tracking-[0.35em] text-[var(--ink-faint)]">
              WRITING JOURNEY
            </p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-[52px] font-bold leading-none tracking-tight [font-family:var(--serif)]">
                {big.num}
              </span>
              <span className="text-[17px] text-[var(--ink-soft)] [font-family:var(--serif)]">
                {big.unit}
              </span>
            </p>
            <p className="mt-2.5 flex items-center gap-1.5 text-[13px] text-[var(--ink-soft)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              {narrative(stats.totalChars)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-[13px] ${
                stats.streak >= 3
                  ? "bg-[var(--accent)] text-white shadow-[0_2px_10px_rgba(192,57,43,0.35)]"
                  : "border border-[var(--hairline-strong)] text-[var(--ink-soft)]"
              }`}
            >
              <Flame size={14} className={stats.streak >= 3 ? "" : "text-[var(--ink-faint)]"} />
              {stats.streak > 0 ? `连续写作 ${stats.streak} 天` : "今天还没动笔"}
            </div>
            {stats.monthChars > 0 ? (
              <p className="text-[12px] text-[var(--ink-faint)]">
                本月已新增 {formatNumber(stats.monthChars)} 字
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* 指标行 */}
      <div
        className="rise mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
        style={{ animationDelay: "0.05s" }}
      >
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-xl border border-[var(--hairline)] bg-[var(--panel)] px-4 py-3.5 shadow-[0_1px_3px_rgba(60,50,30,0.04)]"
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

      {/* 成就印章 */}
      <div
        className="rise mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-5 shadow-[0_1px_3px_rgba(60,50,30,0.04)]"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="flex items-center gap-2">
          <p className="text-[11px] tracking-[0.3em] text-[var(--ink-faint)]">SEALS</p>
          <p className="text-[13px] font-medium [font-family:var(--serif)]">成就印章</p>
          <span className="flex-1" />
          <p className="text-[12px] text-[var(--ink-faint)]">
            {earnedCount} / {SEALS.length}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-8">
          {SEALS.map((seal, i) => {
            const ok = seal.earned(stats);
            return (
              <div
                key={seal.name}
                className="flex flex-col items-center gap-1.5"
                title={`${seal.name} · ${seal.desc}`}
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-[10px] text-[22px] [font-family:var(--serif)] ${
                    i % 2 === 0 ? "-rotate-3" : "rotate-2"
                  } ${
                    ok
                      ? "bg-[var(--accent)] text-white shadow-[0_3px_10px_rgba(192,57,43,0.35)]"
                      : "border-2 border-dashed border-[var(--hairline-strong)] text-[var(--ink-faint)] opacity-70"
                  }`}
                >
                  {seal.char}
                </span>
                <span
                  className={`text-[11px] ${
                    ok ? "text-[var(--ink-soft)]" : "text-[var(--ink-faint)]"
                  }`}
                >
                  {seal.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 热力图 */}
      <div
        className="rise mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-5 shadow-[0_1px_3px_rgba(60,50,30,0.04)]"
        style={{ animationDelay: "0.15s" }}
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
          className="rise mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-5 shadow-[0_1px_3px_rgba(60,50,30,0.04)]"
          style={{ animationDelay: "0.2s" }}
        >
          {stats.categories.length > 0 ? (
            <>
              <p className="text-[11px] tracking-[0.3em] text-[var(--ink-faint)]">CATEGORIES</p>
              <div className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
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
