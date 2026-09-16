"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 单例弹窗宿主：askInput / askConfirm / askCategoryPick / openAuth 这类「从任意位置
 * 唤起全局弹窗」的函数，背后都是同一套「模块级 opener + 一个挂起的 resolve」。
 * 抽出来是为了把两个容易漏的边界一次做对：再次打开、宿主卸载时，上一个还挂着的 promise
 * 一定以取消值结束——旧写法直接覆盖 state，上一个 resolve 就丢了，调用方永远 await 下去。
 *
 * @param cancelValue 取消（点遮罩 / Esc / 被新的一次打开顶掉 / 宿主未挂载）时 resolve 的值
 */
export function createDialogHost<Opts, Result>(cancelValue: Result) {
  // 宿主挂载时写入。同一时刻只有一个宿主（都渲染在 Providers 里），不必存成栈
  let opener: ((opts: Opts) => Promise<Result>) | null = null;

  /** 宿主没挂载时立即返回取消值，调用方不用额外判断（与旧行为一致） */
  const open = (opts: Opts): Promise<Result> =>
    opener ? opener(opts) : Promise.resolve(cancelValue);

  /**
   * 宿主组件用它接管开合：state 非空即「打开中」，close(result) 兑现调用方的 promise。
   * @param onOpen 每次打开时重置宿主自己的附加状态（输入框默认值、搜索词、登录模式…）
   */
  function useHost(onOpen?: (opts: Opts) => void) {
    const [state, setState] = useState<Opts | null>(null);
    // 挂起的 resolve 放 ref：重复打开、卸载时都要能拿到上一个把它结掉
    const pendingRef = useRef<((value: Result) => void) | null>(null);
    // onOpen 每次渲染都是新函数，存进 ref，注册 opener 的 effect 只挂卸一次
    const onOpenRef = useRef(onOpen);
    useEffect(() => {
      onOpenRef.current = onOpen;
    }, [onOpen]);

    /** 收起弹窗并兑现 promise；挂起的 resolve 只用一次，重复调用是安全的空操作 */
    const close = useCallback((result: Result) => {
      const resolve = pendingRef.current;
      pendingRef.current = null;
      setState(null);
      resolve?.(result);
    }, []);

    useEffect(() => {
      opener = (opts) =>
        new Promise<Result>((resolve) => {
          // 上一次还没结束就被顶掉：按「取消」结掉它，否则那个 promise 挂死
          pendingRef.current?.(cancelValue);
          pendingRef.current = resolve;
          onOpenRef.current?.(opts);
          setState(opts);
        });
      return () => {
        opener = null;
        // 宿主卸载（如切换到不含 Providers 的页面）也不能让调用方挂着
        pendingRef.current?.(cancelValue);
        pendingRef.current = null;
      };
    }, []);

    return { state, close };
  }

  return { open, useHost };
}
