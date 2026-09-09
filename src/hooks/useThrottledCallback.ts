"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * trailing 节流：wait 窗口内的多次调用合并成一次，参数取最后一次。
 *
 * 为编辑器的 onChange 而生 —— 每敲一个键就把整篇正文推进 store，会连带把整个文章视图
 * 重渲染一遍；合并到 ~120ms 一次，减少连续输入时的渲染。
 * 代价是最后一次内容可能还压在窗口里，所以必须有 flush()：失焦、切文档、卸载、⌘S
 * 这些「内容要被读走」的时刻都得先把它吐出来，绝不能丢。
 */
export interface ThrottledCallback<T> {
  (value: T): void;
  /** 立刻发出压着的那一次调用（没有则什么都不做） */
  flush(): void;
  /** 丢弃压着的那一次调用 */
  cancel(): void;
}

export function useThrottledCallback<T>(
  fn: (value: T) => void,
  wait: number
): ThrottledCallback<T> {
  // 回调每次渲染都可能换引用，但节流器本身必须稳定（定时器与待发值都挂在它的闭包里），
  // 于是让节流器只认这个 ref，渲染提交后再把最新回调塞进去
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 用 { value } 包一层：值本身可能是空串，不能拿它当「有没有待发」的判据
  const pendingRef = useRef<{ value: T } | null>(null);

  const throttled = useMemo<ThrottledCallback<T>>(() => {
    const stopTimer = () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    const emit = () => {
      timerRef.current = null;
      const next = pendingRef.current;
      if (!next) return;
      pendingRef.current = null;
      fnRef.current(next.value);
    };

    const call = ((value: T) => {
      pendingRef.current = { value };
      // 只在窗口空闲时起表：窗口内的后续调用只更新待发值，到点一起发
      if (timerRef.current === null) timerRef.current = setTimeout(emit, wait);
    }) as ThrottledCallback<T>;

    call.flush = () => {
      stopTimer();
      emit();
    };
    call.cancel = () => {
      stopTimer();
      pendingRef.current = null;
    };
    return call;
  }, [wait]);

  // 卸载（以及节流器被换掉）时兜底：组件没了但待发值还在，最后一次编辑就凭空消失了
  useEffect(() => () => throttled.flush(), [throttled]);

  return throttled;
}
