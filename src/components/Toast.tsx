"use client";

import { useEffect, useState } from "react";
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

export function toast(message: string, type: ToastType = "info"): void {
  const item = { id: nextId++, message, type };
  listeners.forEach((fn) => fn(item));
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />,
  error: <AlertCircle size={15} className="shrink-0 text-[#ff8a7a]" />,
  info: <Info size={15} className="shrink-0 text-[#d8b98a]" />,
};

/** 错误多停留一会儿，成功/提示快进快出 */
const DURATION: Record<ToastType, number> = {
  success: 2600,
  info: 3000,
  error: 5000,
};

const LEAVE_MS = 200;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const dismiss = (id: number) => {
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, LEAVE_MS);
    };
    const onToast: Listener = (item) => {
      setItems((prev) => [...prev.slice(-2), item]);
      setTimeout(() => dismiss(item.id), DURATION[item.type]);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, []);

  const dismissNow = (id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), LEAVE_MS);
  };

  return (
    <div className="pointer-events-none fixed left-1/2 top-16 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`${t.leaving ? "toast-out" : "toast-in"} pointer-events-auto group flex max-w-[calc(100vw-48px)] cursor-pointer items-center gap-2.5 rounded-full bg-[var(--ink)] py-2.5 pl-4 pr-3.5 shadow-[0_10px_36px_-8px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur`}
          onClick={() => dismissNow(t.id)}
          role="status"
        >
          {ICONS[t.type]}
          <span className="min-w-0 truncate text-[13px] leading-5 tracking-wide text-[var(--paper)]">
            {t.message}
          </span>
          <X
            size={13}
            className="shrink-0 text-white/30 transition-colors group-hover:text-white/70"
          />
        </div>
      ))}
    </div>
  );
}
