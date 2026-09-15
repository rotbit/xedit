"use client";

import { useCallback, useRef } from "react";

/**
 * 编辑器 → 浮层菜单的单订阅者通道。
 *
 * 为什么不用 props/state 往上抬：菜单的真相在 CodeMirror 的 StateField 里，
 * 每敲一个过滤字符都把它抬进 React state，就会连累整篇文章视图重渲染。
 * 这里只把变化推给菜单组件自己 setState，重渲染范围止步于那块浮层。
 *
 * 单订阅者足够：一个编辑器实例对应一块菜单，多订阅只会让语义变复杂。
 */
export function useMenuChannel<T>() {
  const cbRef = useRef<((value: T | null) => void) | null>(null);
  const stateRef = useRef<T | null>(null);

  // emit 由扩展在创建编辑器时闭包捕获，必须是稳定引用（编辑器只建一次）
  const emit = useCallback((value: T | null) => {
    stateRef.current = value;
    cbRef.current?.(value);
  }, []);

  const subscribe = useCallback((cb: (value: T | null) => void) => {
    cbRef.current = cb;
    // 订阅当下就补发一次现值：菜单组件挂载晚于编辑器时不会漏掉已打开的状态
    cb(stateRef.current);
    return () => {
      if (cbRef.current === cb) cbRef.current = null;
    };
  }, []);

  return { emit, subscribe };
}
