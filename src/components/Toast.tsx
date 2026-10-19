"use client";

/**
 * Global toast. Deliberately not a Context: toast() is a module-level function callable from anywhere (including non-component code and utilities),
 * and messages are pushed via listeners to the <Toaster /> mounted in the root layout.
 * The cost is one Toaster per app; mounting a second would show every toast twice.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  leaving?: boolean;
}

type Listener = (item: ToastItem) => void;

let nextId = 1;
const listeners = new Set<Listener>();

/** Show a toast. If the Toaster isn't mounted yet the message is simply dropped (no listeners), not queued for later. */
export function toast(message: string, type: ToastType = "info"): void {
  const item = { id: nextId++, message, type };
  listeners.forEach((fn) => fn(item));
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />,
  error: <AlertCircle size={16} className="shrink-0 text-[#ff8a7a]" />,
  info: <Info size={16} className="shrink-0 text-[#d8b98a]" />,
};

/** Errors linger a bit longer; success/info toasts come and go quickly */
const DURATION: Record<ToastType, number> = {
  success: 2600,
  info: 3000,
  error: 5000,
};

// Must match the toast-out animation duration in global styles: shorter and the toast flashes back, longer and an empty gap lingers
const LEAVE_MS = 200;

/** Toast container, mounted in the root layout. At most 3 on screen; older ones are pushed out by new messages. */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  /** Dismiss one: mark it leaving to play the exit animation, then actually remove it when done. Shared by auto-timeout and manual click */
  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), LEAVE_MS);
  }, []);

  useEffect(() => {
    const onToast: Listener = (item) => {
      // Keep only the latest two before adding the new one: stacked toasts would cover the body, and nobody reads a fourth
      setItems((prev) => [...prev.slice(-2), item]);
      setTimeout(() => dismiss(item.id), DURATION[item.type]);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, [dismiss]);

  return (
    // z-[130] sits above every overlay (admin drawer 105, confirm dialog 110, command palette 120): toasts are immediate feedback and shouldn't be blurred by any backdrop
    <div className="pointer-events-none fixed left-1/2 top-16 z-[130] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`${t.leaving ? "toast-out" : "toast-in"} pointer-events-auto group flex max-w-[calc(100vw-48px)] cursor-pointer items-center gap-2.5 rounded-full bg-[var(--ink)] py-2.5 pl-4 pr-3.5 shadow-[0_10px_36px_-8px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur`}
          onClick={() => dismiss(t.id)}
          role="status"
        >
          {ICONS[t.type]}
          <span className="min-w-0 truncate text-[13px] leading-5 tracking-wide text-[var(--paper)]">
            {t.message}
          </span>
          <X
            size={14}
            className="shrink-0 text-white/30 transition-colors group-hover:text-white/70"
          />
        </div>
      ))}
    </div>
  );
}
