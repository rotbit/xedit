"use client";

import { useRef, useState } from "react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";

export function Dropdown({
  trigger,
  children,
  width = 220,
  align = "right",
  closeOnBlur = true,
}: {
  trigger: React.ReactNode;
  /** Pass a function to receive "close panel": for content that should only close after async work (upload, generation) finishes */
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  width?: number;
  /** Edge the menu aligns to with its trigger: triggers near the viewport's left edge use left so the menu doesn't overflow the screen */
  align?: "left" | "right";
  /** Whether window blur closes it: pass false for panels that open the system file picker, or the panel vanishes as soon as a file is chosen */
  closeOnBlur?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The trigger is also in the ref: presses on it aren't closed here but left to the toggle below (otherwise "close then reopen" makes the click look dead)
  const close = () => setOpen(false);
  useDismissMenu(ref, close, open, closeOnBlur);
  useEscape(close, open);

  return (
    <div className="relative shrink-0" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open ? (
        <div
          className={`absolute ${align === "left" ? "left-0" : "right-0"} top-[calc(100%+6px)] z-50 overflow-y-auto rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] max-md:fixed max-md:inset-x-2 max-md:top-[52px] max-md:w-auto!`}
          style={{
            width,
            maxWidth: "calc(100vw - 16px)",
            maxHeight: "calc(100vh - 64px)",
          }}
          onClick={() => setOpen(false)}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}
