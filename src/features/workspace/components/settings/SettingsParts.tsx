"use client";

/**
 * Shared widgets for the settings page: section header (Section), a setting row (Row), segmented control (Seg), secondary button (LinkBtn).
 * Presentation only, no state; toggles reuse components/Switch directly.
 */
import { btnSecondary } from "@/components/Modal";

export { Switch } from "@/components/Switch";

/** A settings section: a small letter-spaced section name + several rows separated by hairlines */
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

/** A setting row: name on the left (optionally with a one-line description), control on the right */
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

/** Segmented control: looks like the range switcher on the history page (outlined frame + solid selected item) */
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

/** Secondary button: the outlined button style used in dialogs */
export function LinkBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={btnSecondary} onClick={onClick}>
      {children}
    </button>
  );
}
