"use client";

import { useEffect, useState } from "react";
import { DOCS_CHANGED_EVENT } from "@/lib/localDocs";
import { todayKey } from "@/lib/todos/dates";
import { DAY_LOG_CHANGED_EVENT } from "@/lib/todos/events";

/**
 * 订阅「文库变了 / 日志变了」两个事件（含别的标签页改日志），返回一个递增的版本号逼组件重渲染；
 * 顺带把「今天」重取一次——页面开过零点后，下一次任何动静都会把日期纠正过来。
 */
export function useTodaySignals(): string {
  const [today, setToday] = useState(() => todayKey());
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => {
      setTick((t) => t + 1);
      setToday(todayKey());
    };
    // 别的标签页勾掉的事写进同一份 localStorage，本页收不到自定义事件，只能靠 storage 事件；
    // key 为 null 是 clear()，日志键也在其中，一并刷新
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith("xedit-day-log")) bump();
    };
    window.addEventListener(DOCS_CHANGED_EVENT, bump);
    window.addEventListener(DAY_LOG_CHANGED_EVENT, bump);
    window.addEventListener("storage", onStorage);
    // 切回标签页时也对一次：隔夜挂着的页面回来就该是新的一天
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.removeEventListener(DOCS_CHANGED_EVENT, bump);
      window.removeEventListener(DAY_LOG_CHANGED_EVENT, bump);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);
  return today;
}
