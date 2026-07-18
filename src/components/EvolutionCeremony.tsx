"use client";

import type { WritingLevel } from "@/lib/level";

/** 进化仪式：全屏墨色幕布 + 墨晕爆发 + 新形态亮相 */
export function EvolutionCeremony({
  level,
  onClose,
}: {
  level: WritingLevel;
  onClose: () => void;
}) {
  const drops = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2;
    const dist = 150 + (i % 3) * 55;
    return {
      dx: `${Math.round(Math.cos(angle) * dist)}px`,
      dy: `${Math.round(Math.sin(angle) * dist)}px`,
      delay: `${0.45 + (i % 5) * 0.04}s`,
      size: 4 + (i % 3) * 3,
    };
  });

  return (
    <div
      className="evo-backdrop fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 120% at 50% 42%, rgba(24,21,16,0.93), rgba(16,14,10,0.98))",
      }}
      onClick={onClose}
    >
      {/* 墨晕爆发 */}
      <span className="evo-burst absolute h-44 w-44 rounded-full bg-[var(--accent)] opacity-40 blur-2xl" />
      <span
        className="evo-burst absolute h-44 w-44 rounded-full bg-white opacity-10 blur-3xl"
        style={{ animationDelay: "0.5s" }}
      />
      {/* 飞溅墨滴 */}
      {drops.map((d, i) => (
        <span
          key={i}
          className="evo-drop absolute rounded-full bg-[var(--accent)]"
          style={
            {
              width: d.size,
              height: d.size,
              "--dx": d.dx,
              "--dy": d.dy,
              animationDelay: d.delay,
            } as React.CSSProperties
          }
        />
      ))}

      <div
        className="relative flex flex-col items-center px-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="evo-item text-[11px] tracking-[0.55em] text-white/50" style={{ animationDelay: "0.9s" }}>
          EVOLUTION
        </p>
        <div className="evo-mascot light-lock mt-5 h-40 w-40 overflow-hidden rounded-full bg-white shadow-[0_0_90px_var(--accent)] ring-4 ring-[var(--accent)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={level.mascot} alt={level.name} className="h-full w-full object-cover" />
        </div>
        <p className="evo-item mt-7 text-[14px] text-white/65" style={{ animationDelay: "1.05s" }}>
          墨灵进化为
        </p>
        <p
          className="evo-item mt-1 text-[42px] font-bold leading-none text-white [font-family:var(--serif)]"
          style={{ animationDelay: "1.15s" }}
        >
          {level.name}
        </p>
        <p className="evo-item mt-2.5 text-[13px] text-white/55" style={{ animationDelay: "1.3s" }}>
          {level.motto}
        </p>
        <p
          className="evo-item mt-4 rounded-full border border-white/15 px-4 py-1.5 text-[12.5px] text-white/80"
          style={{ animationDelay: "1.45s" }}
        >
          整个编辑器已换上「{level.skin}」新装
        </p>
        <button
          className="evo-item mt-9 cursor-pointer rounded-full bg-[var(--accent)] px-7 py-2.5 text-[14px] font-medium text-white shadow-[0_4px_18px_var(--accent)] transition-transform hover:-translate-y-0.5"
          style={{ animationDelay: "1.6s" }}
          onClick={onClose}
        >
          继续写作
        </button>
      </div>
    </div>
  );
}
