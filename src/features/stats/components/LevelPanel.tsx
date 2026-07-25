"use client";

import { Sparkles, Leaf } from "lucide-react";
import { LEVELS, getLevel, getNextLevel } from "@/lib/level";
import { useCountUp } from "../hooks/useCountUp";
import { formatNumber, narrative } from "../lib/format";
import type { Stats } from "../types";

/** 各阶段小圆点：点击广播预览事件，由 EvolutionWatcher 接住 */
function LevelDots({ exp, currentLv }: { exp: number; currentLv: number }) {
  return (
    <span className="flex items-center gap-1.5" title="点小圆点预览各阶段">
      {LEVELS.map((l) => (
        <button
          key={l.lv}
          title={`预览 Lv${l.lv}「${l.name}」· ${formatNumber(l.minChars)} 字`}
          className="group/dot -m-1.5 cursor-pointer p-1.5"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("xedit-evo-preview", { detail: l.lv }))
          }
        >
          <span
            className={`block h-2 w-2 rounded-full transition-transform group-hover/dot:scale-150 ${
              exp >= l.minChars ? "bg-[var(--seal)]" : "bg-[var(--hairline-strong)]"
            } ${l.lv === currentLv ? "ring-2 ring-[var(--seal-wash)]" : ""}`}
          />
        </button>
      ))}
    </span>
  );
}

/**
 * 养成面板：墨灵形象 + 等级经验条 + 墨力流失提示。
 * 等级由墨力（累计字数 − 怠惰流失）决定，可能低于累计字数对应的等级（退化）。
 */
export function LevelPanel({ stats }: { stats: Stats }) {
  const animated = useCountUp(stats.totalChars);
  const exp = stats.effectiveChars ?? stats.totalChars;
  const decay = stats.decay ?? 0;
  const level = getLevel(exp);
  const cumLevel = getLevel(stats.totalChars);
  const degraded = level.lv < cumLevel.lv;
  const next = getNextLevel(exp);
  const expPct = next
    ? Math.min(100, Math.round(((exp - level.minChars) / (next.minChars - level.minChars)) * 100))
    : 100;
  const big =
    stats.totalChars >= 10000
      ? { num: (animated / 10000).toFixed(1), unit: "万字" }
      : { num: String(animated), unit: "字" };

  return (
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
            className={`rise h-full w-full object-cover ${decay > 0 ? "opacity-75 grayscale" : ""}`}
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
              <LevelDots exp={exp} currentLv={level.lv} />
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
  );
}
