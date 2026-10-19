"use client";

// Font color picker (extracted from the old always-on EditorToolbar, now reused by the floating toolbar).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { menuItemCls } from "./menuStyles";
import { tk } from "@/i18n/t";
import { useT } from "@/i18n/useT";

/** Font color swatches: common body-text accent colors that stand out in both light and dark themes */
const TEXT_COLORS = [
  { value: "#e11d48", label: tk("玫红") },
  { value: "#ea580c", label: tk("橙") },
  { value: "#d97706", label: tk("琥珀") },
  { value: "#16a34a", label: tk("绿") },
  { value: "#0d9488", label: tk("青") },
  { value: "#2563eb", label: tk("蓝") },
  { value: "#7c3aed", label: tk("紫") },
  { value: "#db2777", label: tk("粉") },
  { value: "#64748b", label: tk("灰") },
  { value: "#92400e", label: tk("棕") },
];

const PANEL_W = 190;

/**
 * Font color button: an A + a bar of the last-used color, opens the swatches; null = clear color.
 * The host (floating toolbar) is a narrow 36px-tall pill, so a normal absolutely positioned dropdown would be clipped;
 * the swatch panel is portaled to body and fixed-positioned below the button instead.
 */
export function ColorPicker({
  onPick,
  className,
  onOpenChange,
}: {
  onPick: (color: string | null) => void;
  /** The trigger button's style comes from the host so it matches the size of its sibling buttons */
  className: string;
  /** Notifies the host when the swatches open/close: the editor loses focus while they're open, so the host shouldn't collapse itself.
   *  It goes into effect deps, so the host should pass a stable reference */
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useT();
  const [last, setLast] = useState(TEXT_COLORS[0].value);
  const [panel, setPanel] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (panel) return setPanel(null);
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Align to the button's left edge; pull back if it overflows the right side
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8));
    setPanel({ left, top: r.bottom + 6 });
  };

  // Sync the open state to the host; report "closed" on unmount so the host's pending flag is never left set
  useEffect(() => {
    onOpenChange?.(panel !== null);
    return () => onOpenChange?.(false);
  }, [panel, onOpenChange]);

  // Close on clicks outside the panel: the button carries data-menu-trigger, so presses on it go to the toggle above.
  // Don't close on window blur (closeOnBlur=false) — custom color picking opens the system color panel, which blurs the window
  const closePanel = () => setPanel(null);
  useDismissMenu(panelRef, closePanel, panel !== null, false);
  useEscape(closePanel, panel !== null);

  const pick = (color: string | null) => {
    if (color) setLast(color);
    onPick(color);
  };

  return (
    <>
      <button
        ref={btnRef}
        data-menu-trigger
        className={className}
        title={t("字体颜色")}
        onClick={toggle}
      >
        <span className="flex flex-col items-center leading-none">
          <span className="text-[13px] font-semibold leading-none [font-family:var(--sans)]">
            A
          </span>
          <span className="mt-[2px] h-[3px] w-[14px] rounded-full" style={{ background: last }} />
        </span>
      </button>
      {panel
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[80] rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
              style={{ left: panel.left, top: panel.top, width: PANEL_W }}
              // The swatches live on body, out of reach of the host's "press without stealing focus" handling, so swatches/clear prevent it themselves;
              // that keeps the editor focused and the selection intact. The color input needs focus to open the system picker, so let it through
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault();
              }}
            >
              <div className="grid grid-cols-5 justify-items-center gap-1.5 px-3 pb-2 pt-1">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className="h-6 w-6 cursor-pointer rounded-full border border-black/10 transition-transform duration-100 hover:scale-110"
                    style={{ background: c.value }}
                    title={t(c.label)}
                    onClick={() => {
                      pick(c.value);
                      setPanel(null);
                    }}
                  />
                ))}
              </div>
              {/* Custom color picking needs continuous adjustment, so the panel stays open while choosing */}
              <div className="border-t border-[var(--hairline-soft)] px-3.5 py-1.5">
                <label className="flex cursor-pointer items-center justify-between gap-2 text-[13px] text-[var(--ink)]">
                  {t("自定义")}
                  <input
                    type="color"
                    className="h-6 w-9 cursor-pointer rounded border border-[var(--hairline)] bg-transparent p-0"
                    defaultValue={last}
                    onChange={(e) => pick(e.target.value)}
                  />
                </label>
              </div>
              <button
                className={menuItemCls}
                onClick={() => {
                  pick(null);
                  setPanel(null);
                }}
              >
                {t("清除颜色")}
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
