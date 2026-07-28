"use client";

import { useEffect, useState } from "react";

// 会话级缓存：避免多处重复拉统计
let cache: number | null = null;

/** 跨会话缓存：上次拉到的墨力值，先展示旧值，空闲时后台刷新（登出时由 clearMirror 清除） */
const EXP_CACHE_KEY = "xedit-exp-cache";

function readPersisted(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const v = Number(localStorage.getItem(EXP_CACHE_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** 登录用户的当前墨力（累计字数扣除怠惰流失，等级依据）；未登录或未加载返回 null */
export function useTotalChars(enabled: boolean): number | null {
  const [exp, setExp] = useState<number | null>(() => cache ?? readPersisted());

  useEffect(() => {
    if (!enabled || cache !== null) return;
    let cancelled = false;
    const load = () =>
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
            try {
              localStorage.setItem(EXP_CACHE_KEY, String(v));
            } catch {
              // 隐私模式下写不进就算了，下次会话重新拉
            }
          }
        })
        .catch(() => undefined);
    // 墨力只驱动等级徽章/进化仪式，不在首屏关键路径上：
    // 挪到浏览器空闲时再拉，把启动窗口让给文档同步等要紧请求
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(load, { timeout: 5000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const t = setTimeout(load, 2000); // Safari 没有 requestIdleCallback
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled]);

  return exp;
}
