"use client";

import { useEffect, useState } from "react";
import type { Stats } from "../types";

/** 拉取写作足迹数据；未就绪时返回 null，由调用方渲染加载态 */
export function useStats(): Stats | null {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!cancelled && s) setStats(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return stats;
}
