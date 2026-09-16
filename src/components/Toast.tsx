"use client";

/**
 * 全局轻提示。刻意不做成 Context：toast() 是模块级函数，任何位置（包括非组件代码、工具函数）都能直接调，
 * 消息通过 listeners 推给挂在根布局里的 <Toaster />。
 * 代价是全应用只能有一个 Toaster，多挂一份就会看到每条提示出现两次。
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

/** 发一条提示。Toaster 尚未挂载时这条消息直接丢弃（没有监听者），不会排队补发。 */
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

// 必须和全局样式里 toast-out 动画的时长对齐：这里短了会看到提示闪回，长了会留一块空白占位
const LEAVE_MS = 200;

/** 提示容器，挂在根布局。同屏最多 3 条，更早的会被新消息挤掉。 */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  /** 收起一条：先标记 leaving 放退场动画，动画结束再真正移除。超时自动收与点击手动收共用 */
  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), LEAVE_MS);
  }, []);

  useEffect(() => {
    const onToast: Listener = (item) => {
      // 只保留最近两条再接上新的这条：提示叠太高会挡住正文，也没人会去读第四条
      setItems((prev) => [...prev.slice(-2), item]);
      setTimeout(() => dismiss(item.id), DURATION[item.type]);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, [dismiss]);

  return (
    <div className="pointer-events-none fixed left-1/2 top-16 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
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
            size={13}
            className="shrink-0 text-white/30 transition-colors group-hover:text-white/70"
          />
        </div>
      ))}
    </div>
  );
}
