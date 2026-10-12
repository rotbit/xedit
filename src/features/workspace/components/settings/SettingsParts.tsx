"use client";

/**
 * 设置页的通用小部件：分段标题（Section）、一行设置（Row）、分段控件（Seg）、次要按钮（LinkBtn）。
 * 只管样子，不碰任何状态；开关直接复用 components/Switch。
 */
import { btnSecondary } from "@/components/Modal";

export { Switch } from "@/components/Switch";

/** 一段设置：小号字距拉开的段名 + 细线分隔的若干行 */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="border-b border-[var(--hairline)] pb-2 text-[11.5px] tracking-[.14em] text-[var(--ink-faint)]">
        {title}
      </h2>
      <div className="divide-y divide-[var(--hairline-soft)]">{children}</div>
    </section>
  );
}

/** 一行设置：左边名称（可带一句说明），右边控件 */
export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-[13.5px] text-[var(--ink)]">{label}</div>
        {hint ? <div className="mt-0.5 text-[12.5px] text-[var(--ink-faint)]">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** 分段控件：样子同历史页的范围切换（描边外框 + 选中项实心） */
export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-[7px] border border-[var(--hairline)] p-0.5 text-[12.5px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`cursor-pointer rounded-[5px] px-3 py-1 leading-none transition-colors ${
              on
                ? "bg-[var(--ink)] font-medium text-[var(--paper)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 次要按钮：弹窗里那款描边按钮 */
export function LinkBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={btnSecondary} onClick={onClick}>
      {children}
    </button>
  );
}
