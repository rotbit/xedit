"use client";

import { useState } from "react";

const DAILY_GOALS = [100, 300, 500, 1000, 2000];

/** 每日目标：点击目标值在预设档位间循环，选择本地记忆 */
export function useDailyGoal(): { dailyGoal: number; cycleGoal: () => void } {
  const [dailyGoal, setDailyGoal] = useState(() => {
    if (typeof window === "undefined") return 300;
    try {
      const v = Number(localStorage.getItem("xedit-daily-goal"));
      return DAILY_GOALS.includes(v) ? v : 300;
    } catch {
      return 300;
    }
  });

  const cycleGoal = () => {
    const next = DAILY_GOALS[(DAILY_GOALS.indexOf(dailyGoal) + 1) % DAILY_GOALS.length];
    setDailyGoal(next);
    try {
      localStorage.setItem("xedit-daily-goal", String(next));
    } catch {
      // 忽略
    }
  };

  return { dailyGoal, cycleGoal };
}
