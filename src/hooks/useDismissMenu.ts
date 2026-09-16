"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * 弹出菜单的关闭时机：在面板外按下鼠标（左/右键都算）、滚轮、窗口失焦。
 * 用 capture 阶段的原生监听：右键别的行时，先关旧菜单，再由那一行的 onContextMenu 开新菜单。
 * 不用透明遮罩——遮罩会吞掉右键并弹出浏览器原生菜单，菜单反而关不掉。
 *
 * 唤出菜单的「⋯」按钮带 data-menu-trigger：按在它上面不由这里关，
 * 交给按钮自己的 toggle（否则会「先关再开」，看起来点了没反应）。
 */
export function useDismissMenu(
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  active: boolean,
  /** 窗口失焦是否关闭：唤起系统面板（如取色器）的菜单要传 false，否则一选色就被收走 */
  closeOnBlur = true
) {
  // closeXxxMenu 每次渲染都是新函数，存进 ref，监听只随 active 挂卸一次
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    const close = () => closeRef.current();
    /** 面板外按下/右键即关；注意不 preventDefault：
     *  右键别的行由那一行自己处理，右键空白处让浏览器原生菜单照常出 */
    const onOutside = (e: Event) => {
      const target = e.target as Node | null;
      if (panelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-menu-trigger]")) return;
      close();
    };
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("contextmenu", onOutside, true);
    /** 滚轮：面板自己可滚（长菜单），滚在面板里不关 */
    const onWheel = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node | null)) return;
      close();
    };
    document.addEventListener("wheel", onWheel, { capture: true, passive: true });
    if (closeOnBlur) window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("mousedown", onOutside, true);
      document.removeEventListener("contextmenu", onOutside, true);
      document.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("blur", close);
    };
  }, [active, panelRef, closeOnBlur]);
}
