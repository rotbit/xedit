"use client";

import { useEffect } from "react";

/** 滚动停下多久后滑块淡出（Obsidian 约 0.8s） */
const LINGER_MS = 800;

/**
 * 滚动条「滚动时才浮现」：滚动事件在捕获阶段统一收，给正在滚的元素打 is-scrolling，
 * 停下 LINGER_MS 后摘掉。globals.css 只对带这个类的元素显出滑块。
 * 为什么不用 :hover：鼠标只要停在可滚区域上滑块就常亮，长文列表旁边总挂着一条灰杠。
 * 页面级滚动的 target 是 document，落到 <html> 上。
 */
export function ScrollbarReveal() {
  useEffect(() => {
    const timers = new WeakMap<Element, number>();
    const onScroll = (e: Event) => {
      const el = e.target instanceof Element ? e.target : document.documentElement;
      el.classList.add("is-scrolling");
      window.clearTimeout(timers.get(el));
      timers.set(
        el,
        window.setTimeout(() => el.classList.remove("is-scrolling"), LINGER_MS)
      );
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);
  return null;
}
