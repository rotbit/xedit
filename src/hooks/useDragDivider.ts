"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Options<S> {
  /** 按下时记下起点（起始坐标、起始值、容器矩形……），之后每帧都拿它换算 */
  start: (e: React.PointerEvent<HTMLElement>) => S;
  /**
   * 指针移动 → 新值。返回 undefined 表示这一帧算不出来（例如容器宽度为 0），
   * 沿用上一帧。返回值要自己夹在合法区间内：拖动中显示的就是它。
   */
  move: (e: PointerEvent, start: S) => number | undefined;
  /** 松手（含取消）时落地：写 store / 写 localStorage 都放这里，拖动过程中不调用 */
  commit: (value: number) => void;
}

/**
 * 分隔条拖动。两条分隔条（阅读器的源码/预览、侧栏右缘）原先各写一遍，
 * 都只监听 pointermove/pointerup：指针被系统抢走（长按菜单、切到别的窗口）时
 * 收不到 pointerup，手柄就一直"粘"在指针上。这里统一成
 * setPointerCapture + pointerup/pointercancel/lostpointercapture 三个结束口。
 *
 * 另一条是持久化的时机：拖动每帧只更新本组件的 state，松手才 commit，
 * 免得一次拖动往 localStorage（zustand persist）里写掉上百次。
 */
export function useDragDivider<S>({ start, move, commit }: Options<S>) {
  /** 拖动中的实时值；null = 没在拖，调用方这时显示已持久化的值 */
  const [value, setValue] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // 回调随渲染变，但 onPointerDown 必须稳定（否则手柄每渲染换一次监听），存 ref 取最新
  const fns = useRef({ start, move, commit });
  useEffect(() => {
    fns.current = { start, move, commit };
  });

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    // 捕获指针：即使拖出手柄范围（甚至掠过 iframe/编辑器）事件也仍归它
    handle.setPointerCapture(e.pointerId);
    const origin = fns.current.start(e);
    let latest: number | null = null;
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      const next = fns.current.move(ev, origin);
      if (next === undefined) return;
      latest = next;
      setValue(next);
    };
    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
      handle.removeEventListener("lostpointercapture", onEnd);
      setDragging(false);
      setValue(null);
      // 一动没动就别落盘（纯点击手柄也会走到这里）
      if (latest !== null) fns.current.commit(latest);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
    // 指针被系统收走（切窗口、系统手势）时 pointerup 不一定来，这个一定来
    handle.addEventListener("lostpointercapture", onEnd);
  }, []);

  return { value, dragging, onPointerDown };
}
