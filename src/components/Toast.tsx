"use client";

import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

type Listener = (item: ToastItem) => void;

let nextId = 1;
const listeners = new Set<Listener>();

export function toast(message: string, type: ToastType = "info"): void {
  const item = { id: nextId++, message, type };
  listeners.forEach((fn) => fn(item));
}

const TYPE_STYLE: Record<ToastType, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-[var(--hairline-strong)] bg-[var(--panel)] text-[var(--ink)]",
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast: Listener = (item) => {
      setItems((prev) => [...prev, item]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== item.id));
      }, 3200);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed left-1/2 top-14 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rounded-md border px-4 py-2 text-[13px] shadow-[0_4px_16px_rgba(0,0,0,0.08)] ${TYPE_STYLE[t.type]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
