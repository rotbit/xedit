"use client";

import { useEffect, useState } from "react";
import {
  Flame,
  FileText,
  Type,
  TrendingUp,
  Loader2,
  AlignLeft,
  Sparkles,
  Leaf,
} from "lucide-react";
import { LEVELS, getLevel, getNextLevel, DECAY_GRACE_DAYS, DECAY_PER_DAY } from "@/lib/level";

interface Stats {
  totalDocs: number;
  totalChars: number;
  effectiveChars?: number;
  decay?: number;
  daysSinceActive?: number | null;
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

/** 近 12 周字数趋势：与热力图同口径（自然周，周一起算）聚合成条形图 */
function TrendChart({ data }: { data: Stats["heatmap"] }) {
  const first = new Date(data[0].date);
  const firstOffset = (first.getDay() + 6) % 7;
  const weeks: { chars: number; days: number; start: string; end: string }[] = [];
  data.forEach((d, i) => {
    const w = Math.floor((firstOffset + i) / 7);
    if (!weeks[w]) weeks[w] = { chars: 0, days: 0, start: d.date, end: d.date };
    weeks[w].chars += d.chars;
    if (d.active) weeks[w].days += 1;
    weeks[w].end = d.date;
  });
  const max = Math.max(...weeks.map((w) => w.chars), 1);
  const H = 128;
  const TOP = 16; // 与热力图月份标签行对齐
  const BASE = H - 3;
  const n = weeks.length;
  const slot = 100 / n;
  const barPct = slot * 0.62;

  const thisWeek = weeks[n - 1]?.chars ?? 0;
  const lastWeek = weeks[n - 2]?.chars ?? 0;
  const delta = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
  const summary =
    delta === null
      ? thisWeek > 0 && lastWeek === 0
        ? "，上周未动笔"
        : ""
      : delta === 0
        ? "，与上周持平"
        : `，较上周${delta > 0 ? "多" : "少"} ${Math.abs(delta)}%`;
  const fmtDay = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;

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
        每周字数 · 本周 {formatNumber(thisWeek)} 字{summary}
      </p>
    </>
  );
}

const DAILY_GOALS = [100, 300, 500, 1000, 2000];

export function WritingStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  // 每日目标：点击目标值循环切换
  const [dailyGoal, setDailyGoal] = useState(() => {
    if (typeof window === "undefined") return 300;
    try {
      const v = Number(localStorage.getItem("xedit-daily-goal"));
      return DAILY_GOALS.includes(v) ? v : 300;
    } catch {
      return 300;
    }
  });

  const cycleGoal = () => {
    const next = DAILY_GOALS[(DAILY_GOALS.indexOf(dailyGoal) + 1) % DAILY_GOALS.length];
    setDailyGoal(next);
    try {
      localStorage.setItem("xedit-daily-goal", String(next));
    } catch {
      // 忽略
    }
  };

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

  // 养成体系：等级由墨力（累计 − 怠惰流失）决定
  const exp = stats.effectiveChars ?? stats.totalChars;
  const decay = stats.decay ?? 0;
  const level = getLevel(exp);
  const cumLevel = getLevel(stats.totalChars);
  const degraded = level.lv < cumLevel.lv;
  const next = getNextLevel(exp);
  const expPct = next
    ? Math.min(
        100,
        Math.round(((exp - level.minChars) / (next.minChars - level.minChars)) * 100)
      )
    : 100;
  const todayChars = stats.heatmap[stats.heatmap.length - 1]?.chars ?? 0;
  const goalPct = Math.min(1, todayChars / dailyGoal);
  const goalDone = todayChars >= dailyGoal;
  const RING_R = 40;
  const RING_C = 2 * Math.PI * RING_R;

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

  const catTotal = stats.categories.reduce((s, c) => s + c.count, 0) || 1;
  const insights: string[] = [];
  if (stats.peakHour !== null) insights.push(`最常在 ${stats.peakHour} 点写作`);

  return (
    <div>
      {/* 养成面板：墨灵 + 等级经验 + 今日修行 */}
      <div className="rise grid grid-cols-1 gap-4 lg:grid-cols-[1fr_264px]">
        {/* 墨灵与进化 */}
        <div
          className="relative overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          style={{
            backgroundImage:
              "radial-gradient(120% 180% at 88% -30%, var(--seal-wash), transparent 55%)",
          }}
        >
          <div className="flex items-center gap-5">
            <div className="light-lock flex h-[120px] w-[120px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-[var(--hairline)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={level.lv}
                src={level.mascot}
                alt={`墨灵 · ${level.name}`}
                className={`rise h-full w-full object-cover ${
                  decay > 0 ? "opacity-75 grayscale" : ""
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--seal)] px-2.5 py-0.5 text-[11.5px] font-medium text-white">
                  Lv{level.lv} · {level.name}
                </span>
                <span className="text-[12px] text-[var(--ink-faint)]">{level.motto}</span>
              </div>
              <p className="mt-2.5 flex items-baseline gap-1.5">
                <span className="text-[34px] font-bold leading-none tracking-tight [font-family:var(--serif)]">
                  {big.num}
                </span>
                <span className="text-[14px] text-[var(--ink-soft)] [font-family:var(--serif)]">
                  {big.unit}
                </span>
                <span className="ml-2 text-[12px] text-[var(--ink-soft)]">
                  {narrative(stats.totalChars)}
                </span>
              </p>
              {/* 经验条 */}
              <div className="mt-3.5">
                <div className="h-2 overflow-hidden rounded-full bg-[var(--hairline)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--seal)] to-[var(--seal-deep)] transition-[width] duration-700"
                    style={{ width: `${expPct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="text-[11.5px] text-[var(--ink-faint)]">
                    {next
                      ? `距${degraded ? "夺回" : "进化"}「${next.name}」还差 ${formatNumber(next.minChars - exp)} 字`
                      : "已是最终形态，落笔即传说"}
                  </p>
                  <span className="flex items-center gap-1.5" title="点小圆点预览各阶段">
                    {LEVELS.map((l) => (
                      <button
                        key={l.lv}
                        title={`预览 Lv${l.lv}「${l.name}」· ${formatNumber(l.minChars)} 字`}
                        className="group/dot -m-1.5 cursor-pointer p-1.5"
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent("xedit-evo-preview", { detail: l.lv })
                          )
                        }
                      >
                        <span
                          className={`block h-2 w-2 rounded-full transition-transform group-hover/dot:scale-150 ${
                            exp >= l.minChars
                              ? "bg-[var(--seal)]"
                              : "bg-[var(--hairline-strong)]"
                          } ${l.lv === level.lv ? "ring-2 ring-[var(--seal-wash)]" : ""}`}
                        />
                      </button>
                    ))}
                  </span>
                </div>
              </div>
              {decay > 0 ? (
                <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--seal-deep)]">
                  <Leaf size={11} />
                  已 {stats.daysSinceActive} 天未动笔，墨力流失 {formatNumber(decay)} 字
                  {degraded
                    ? `，墨灵从「${cumLevel.name}」退化了…动笔即可止损`
                    : level.lv > 1
                      ? `，再流失 ${formatNumber(exp - level.minChars + 1)} 字将退化`
                      : "，动笔即可止损"}
                </p>
              ) : next ? (
                <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-[var(--ink-soft)]">
                  <Sparkles size={11} className="text-[var(--seal)]" />
                  进化为「{next.name}」后，墨灵将迎来全新形态
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* 今日修行 */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="relative h-[104px] w-[104px]">
            <svg width={104} height={104} className="-rotate-90">
              <circle
                cx={52}
                cy={52}
                r={RING_R}
                fill="none"
                stroke="var(--hairline)"
                strokeWidth={8}
              />
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
      </div>

      {/* 指标行 */}
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

      {/* 热力图 */}
      <div
        className="rise mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        style={{ animationDelay: "0.15s" }}
      >
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="shrink-0">
            <p className="text-[11px] tracking-[0.3em] text-[var(--ink-faint)]">ACTIVITY</p>
            <div className="mt-3 overflow-x-auto">
              <Heatmap data={stats.heatmap} />
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--ink-faint)]">
              最近 12 周 · 颜色越深当天写得越多
            </p>
          </div>
          <div className="min-w-0 flex-1 border-t border-[var(--hairline)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <p className="text-[11px] tracking-[0.3em] text-[var(--ink-faint)]">TREND</p>
            <div className="mt-3">
              <TrendChart data={stats.heatmap} />
            </div>
          </div>
        </div>
      </div>

      {/* 分类分布 + 洞察 */}
      {stats.categories.length > 0 || insights.length > 0 ? (
        <div
          className="rise mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
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
