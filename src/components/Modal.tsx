"use client";

import { X } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";

/** Primary dialog button: OK / Save / Start sync… */
export const btnPrimary =
  "flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-deep)] disabled:opacity-60";

/** Secondary dialog button: outlined buttons like Stop / Cancel */
export const btnSecondary =
  "flex cursor-pointer items-center rounded-md border border-[var(--hairline-strong)] px-4 py-1.5 text-[13px] text-[var(--ink-soft)] hover:bg-[var(--paper)] disabled:opacity-60";

/**
 * Shell for functional dialogs with a title bar: backdrop + panel + 48px title bar (icon + title + X) + Esc to close.
 * Shared by Feishu import / Markdown import / custom CSS, which differ only in size and stacking, expressed via props;
 * the panel itself is a vertical flex, and the content area decides whether to scroll or fill.
 */
export function Modal({
  title,
  icon,
  width,
  height,
  maxWidth = "94vw",
  maxHeight = "92vh",
  z = 95,
  locked = false,
  onClose,
  children,
}: {
  title: string;
  /** Small icon left of the title; when omitted the title bar skips flex layout, identical to the old text-only title */
  icon?: React.ReactNode;
  width: number;
  /** Fixed height (editor panels like custom CSS need one); omitted means sized by content */
  height?: number;
  maxWidth?: string;
  maxHeight?: string;
  /** Stacking level: imports 95, theme/CSS 90 */
  z?: number;
  /** Lock the close affordances (e.g. while importing): backdrop, Esc and X all do nothing */
  locked?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEscape(onClose, !locked);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      style={{ zIndex: z }}
      onClick={() => {
        if (!locked) onClose();
      }}
    >
      <div
        className="flex flex-col overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        style={{ width, height, maxWidth, maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4">
          <span
            className={
              icon
                ? "flex items-center gap-2 text-[14px] font-medium [font-family:var(--serif)]"
                : "text-[14px] font-medium [font-family:var(--serif)]"
            }
          >
            {icon}
            {title}
          </span>
          <button
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)] disabled:opacity-40"
            onClick={onClose}
            disabled={locked}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Lightweight paper-style dialog shell: faint backdrop + rounded panel that pops in with toast-in; title row and buttons come from children.
 * Shared by askInput / askConfirm / askCategoryPick / the sign-in dialog — they're lighter than Modal (no title bar, no X),
 * hence a second shell rather than a flag on Modal.
 */
export function PaperDialog({
  width,
  maxWidth = "92vw",
  z = 110,
  padded = false,
  panelClass = "",
  onClose,
  children,
}: {
  width: number;
  maxWidth?: string;
  z?: number;
  /** 16px margin around the backdrop so the taller sign-in dialog doesn't touch the edges on narrow screens */
  padded?: boolean;
  /** Extra panel classes: the category picker needs vertical flex + capped-height scrolling */
  panelClass?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Esc is attached only once the panel renders, equivalent to each host's old `useEscape(cancel, isOpen)`
  useEscape(onClose);

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[2px] ${padded ? "p-4" : ""}`}
      style={{ zIndex: z }}
      onClick={onClose}
    >
      <div
        className={`toast-in overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_24px_70px_-16px_rgba(40,25,5,0.4)] ${panelClass}`}
        style={{ width, maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
