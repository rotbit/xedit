"use client";

// Editor-side outline panel. It parses headings from the Markdown source rather than, like useOutline on the reading/share side,
// extracting them from the rendered DOM: in edit mode the left is a textarea and the right preview may be collapsed or scrolled elsewhere, so there's no stable
// rendered DOM to read; and jumps must land on a source line number, which only parsing the source provides.
// The two approaches coexist rather than merge; the indent formula is shared via outlineIndent in useOutline.

import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { ChevronsLeft } from "lucide-react";
import { outlineIndent } from "@/hooks/useOutline";
import { useActiveHeading, type SubscribeTopLine } from "@/hooks/useTopLine";
import { useStore } from "@/store/useStore";
import { useT } from "@/i18n/useT";

interface Heading {
  level: number;
  text: string;
  line: number;
}

/** Extract the H1–H3 outline from Markdown content (skipping # inside code blocks) */
function parseOutline(content: string): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,3})\s+(.+)/.exec(line);
    if (m) {
      headings.push({
        level: m[1].length,
        text: m[2].replace(/[*_`~]/g, "").trim(),
        line: i,
      });
    }
  }
  return headings;
}

/** Font size/weight/family are tiered by level and kept separate from color: the current item changes color, and when two text-* classes coexist
    which wins depends on stylesheet order, not order here; keeping them separate means only one color class applies */
const LEVEL_TYPE: Record<number, string> = {
  1: "text-[13px] font-medium [font-family:var(--serif)]",
  2: "text-[12.5px]",
  3: "text-[12px]",
};
const LEVEL_INK: Record<number, string> = {
  1: "text-[var(--ink)]",
  2: "text-[var(--ink-soft)]",
  3: "text-[var(--ink-faint)]",
};

export function OutlinePanel({
  onJump,
  onClose,
  active = true,
  subscribeTopLine,
}: {
  onJump: (line: number) => void;
  /** Collapse the panel: once collapsed, the floating entry at the top-left of the body column takes over */
  onClose: () => void;
  /** Whether the panel is expanded: the component stays mounted (hidden via w-0 animation) and skips parsing when collapsed */
  active?: boolean;
  /** Subscribes to the line number at the top of the editor viewport to highlight the current section; no highlight if omitted */
  subscribeTopLine?: SubscribeTopLine;
}) {
  const t = useT();
  const content = useStore((s) => s.content);
  // Low-priority value: while typing continuously the editor renders first and the outline catches up a beat later
  const deferredContent = useDeferredValue(content);
  const outline = useMemo(
    () => (active ? parseOutline(deferredContent) : []),
    [deferredContent, active]
  );
  const { index: activeIndex, pin } = useActiveHeading(outline, subscribeTopLine, active);

  // A long outline scrolls too: bring the current section back when it scrolls out of the panel's view.
  // block:"nearest" — doesn't move if already visible, and only scrolls the nearest scrollable ancestor (the panel), leaving the page alone
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (activeIndex < 0) return;
    itemsRef.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-[var(--hairline-soft)] bg-[var(--panel)]">
      {/* Title row: the left labels what this is, the 《 on the right collapses the panel, swapping with the floating entry at the body column's top-left */}
      <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-3">
        <span className="pl-1 text-[11px] tracking-[0.15em] text-[var(--ink-faint)]">{t("目录")}</span>
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
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {/* No headings means blank space, no prompt copy */}
        {outline.map((h, i) => (
          <button
            key={h.line}
            ref={(el) => {
              itemsRef.current[i] = el;
            }}
            // The current item only changes text and background color: no left bar, no bold — bold would make the truncation point jitter
            className={`block w-full cursor-pointer truncate mb-[2px] rounded-md py-[5px] pr-2 text-left leading-5 transition-colors ${
              LEVEL_TYPE[h.level]
            } ${
              i === activeIndex
                ? "bg-[var(--accent-wash)] text-[var(--accent)]"
                : // Hover background is half as strong as the current item, and with the 2px gap between items the two states stay distinct side by side
                  `${LEVEL_INK[h.level]} hover:bg-[color-mix(in_srgb,var(--accent-wash)_50%,transparent)] hover:text-[var(--ink)]`
            }`}
            style={{
              paddingLeft: outlineIndent(h.level),
              // A little space between H1 entries gives a sense of chapter grouping
              marginTop: h.level === 1 && i > 0 ? 6 : 0,
            }}
            title={h.text}
            onClick={() => {
              pin(i);
              onJump(h.line);
            }}
          >
            {h.text}
          </button>
        ))}
      </div>
    </aside>
  );
}
