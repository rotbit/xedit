"use client";

import { useEffect, useState } from "react";

// 会话级缓存：避免多处重复拉统计
let cache: number | null = null;

/** 登录用户的当前墨力（累计字数扣除怠惰流失，等级依据）；未登录或未加载返回 null */
export function useTotalChars(enabled: boolean): number | null {
  const [exp, setExp] = useState<number | null>(cache);

  useEffect(() => {
    if (!enabled || cache !== null) return;
    let cancelled = false;
    void fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (cancelled || !s) return;
        const v =
          typeof s.effectiveChars === "number"
            ? s.effectiveChars
            : typeof s.totalChars === "number"
              ? s.totalChars
              : null;
        if (v !== null) {
          cache = v;
          setExp(v);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return exp;
}
