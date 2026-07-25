"use client";

import { useStore } from "@/store/useStore";
import { menuItemCls } from "@/components/Dropdown";

/** 菜单里的开关行：点击不关闭菜单，便于连续切换 */
export function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className={menuItemCls}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!value);
      }}
    >
      <span className="flex-1 text-left">{label}</span>
      <span
        className={`relative h-4 w-7 rounded-full transition-colors ${value ? "bg-[var(--accent)]" : "bg-[var(--hairline-strong)]"}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${value ? "left-3.5" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

/** 排版微调滑杆行 */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-1.5" onClick={(e) => e.stopPropagation()}>
      <span className="w-7 shrink-0 text-[12px] text-[var(--ink-soft)]">{label}</span>
      <input
        type="range"
        className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-11 shrink-0 text-right text-[11.5px] text-[var(--ink-faint)] [font-family:var(--mono)]">
        {value}
        {unit}
      </span>
    </div>
  );
}

/** 排版微调区块：字号 / 行高 / 段距三档滑杆 + 一键重置，编辑页与阅读页共用 */
export function TypographyTuner() {
  const tuneFontSize = useStore((s) => s.tuneFontSize);
  const tuneLineHeight = useStore((s) => s.tuneLineHeight);
  const tuneParaSpacing = useStore((s) => s.tuneParaSpacing);
  const setTune = useStore((s) => s.setTune);

  return (
    <>
      <p className="px-3.5 pb-0.5 pt-0.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
        排版微调
      </p>
      <SliderRow
        label="字号"
        value={tuneFontSize}
        min={14}
        max={18}
        step={0.5}
        unit="px"
        onChange={(v) => setTune({ tuneFontSize: v })}
      />
      <SliderRow
        label="行高"
        value={tuneLineHeight}
        min={1.5}
        max={2.2}
        step={0.05}
        unit=""
        onChange={(v) => setTune({ tuneLineHeight: v })}
      />
      <SliderRow
        label="段距"
        value={tuneParaSpacing}
        min={8}
        max={28}
        step={2}
        unit="px"
        onChange={(v) => setTune({ tuneParaSpacing: v })}
      />
      <button
        className="mx-3.5 my-1 cursor-pointer rounded px-1.5 py-0.5 text-[11.5px] text-[var(--ink-faint)] hover:text-[var(--accent)]"
        onClick={(e) => {
          e.stopPropagation();
          setTune({ tuneFontSize: 16, tuneLineHeight: 1.75, tuneParaSpacing: 16 });
        }}
      >
        重置排版微调
      </button>
    </>
  );
}
