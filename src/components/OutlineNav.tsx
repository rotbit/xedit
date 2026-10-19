"use client";

// Outline navigation (desktop): extracts h1–h3 from the rendered output, click to smooth-scroll (shared by the share page and reading mode)

import { ChevronsLeft } from "lucide-react";
import { outlineIndent } from "@/hooks/useOutline";
import { useT } from "@/i18n/useT";

export function OutlineNav({
  outline,
  onJump,
  onClose,
  className = "hidden w-[190px] shrink-0 lg:block",
}: {
  outline: { level: number; text: string }[];
  onJump: (index: number) => void;
  /** Only when provided does the collapse button appear (collapsible in reading mode, always shown on the share page) */
  onClose?: () => void;
  /** Overrides the outer class of <nav> (width / visibility / shrink); defaults to a 190px narrow desktop column */
  className?: string;
}) {
  const t = useT();
  return (
    <nav className={className}>
      <div className="sticky top-0 pt-1">
        {/* Title row: when collapsible, a 《 sits on the right, swapping with the floating entry at the scroll area's top-left */}
        {onClose ? (
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] tracking-[0.15em] text-[var(--ink-faint)]">{t("大纲")}</p>
            <button
              type="button"
              title={t("收起目录")}
              aria-label={t("收起目录")}
              onClick={onClose}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
            >
              <ChevronsLeft size={16} />
            </button>
          </div>
        ) : (
          <p className="mb-3 text-[12px] tracking-[0.15em] text-[var(--ink-faint)]">{t("大纲")}</p>
        )}
        <div className="flex flex-col gap-0.5">
          {outline.map((h, i) => (
            <button
              key={`${i}-${h.text}`}
              className="cursor-pointer truncate rounded-md px-2 py-1 text-left text-[12px] leading-relaxed text-[var(--ink-soft)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
              style={{ paddingLeft: outlineIndent(h.level) }}
              title={h.text}
              onClick={() => onJump(i)}
            >
              {h.text}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
