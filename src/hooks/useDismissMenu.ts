"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * When a popup menu closes: mouse down outside the panel (left or right button), wheel, window blur.
 * Uses native capture-phase listeners: right-clicking another row closes the old menu first, then that row's onContextMenu opens a new one.
 * No transparent backdrop — a backdrop would swallow right-clicks and pop the browser's native menu, and then the menu couldn't be closed.
 *
 * The "⋯" button that opens the menu has data-menu-trigger: pressing it isn't handled here
 * but by the button's own toggle (otherwise it would "close then reopen" and look like the click did nothing).
 */
export function useDismissMenu(
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  active: boolean,
  /** Whether to close on window blur: menus that open system panels (like a color picker) should pass false, or picking a color dismisses them */
  closeOnBlur = true
) {
  // closeXxxMenu is a new function every render; store it in a ref so listeners attach/detach only with active
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    const close = () => closeRef.current();
    /** Close on mousedown / right-click outside the panel; note no preventDefault:
     *  right-clicking another row is handled by that row, and right-clicking blank space lets the browser's native menu show as usual */
    const onOutside = (e: Event) => {
      const target = e.target as Node | null;
      if (panelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-menu-trigger]")) return;
      close();
    };
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("contextmenu", onOutside, true);
    /** Wheel: the panel itself can scroll (long menus), so scrolling inside it doesn't close */
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
