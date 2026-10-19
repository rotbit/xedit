"use client";

import { useEffect } from "react";

/** How long after scrolling stops the thumb fades out (Obsidian is about 0.8s) */
const LINGER_MS = 800;

/**
 * Scrollbars that "appear only while scrolling": scroll events are caught in the capture phase, the scrolling element gets is-scrolling,
 * which is removed after LINGER_MS of stillness. globals.css only shows the thumb on elements with that class.
 * Why not :hover: the thumb would stay lit whenever the mouse rests over a scrollable area, leaving a grey bar beside long lists.
 * For page-level scrolling the target is document, which maps to <html>.
 */
export function ScrollbarReveal() {
  useEffect(() => {
    const timers = new WeakMap<Element, number>();
    const onScroll = (e: Event) => {
      const el = e.target instanceof Element ? e.target : document.documentElement;
      // Repeated add still writes the class attribute; continuous scrolling only extends the timer, avoiding per-frame mutations of the scroll container.
      if (!el.classList.contains("is-scrolling")) el.classList.add("is-scrolling");
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
