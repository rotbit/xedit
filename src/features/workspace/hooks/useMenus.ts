"use client";

import { useCallback, useState } from "react";

/** Doc menu anchor: right-anchored so the menu isn't clipped by the list container */
export interface DocMenuAnchor {
  id: string;
  top: number;
  right: number;
}

export interface CatMenuAnchor {
  path: string;
  top: number;
  left: number;
}

/** The account menu pops upward from the trigger row at the bottom of the sidebar */
export interface AccountMenuAnchor {
  bottom: number;
  left: number;
  width: number;
}

/** Lower bound for the right anchor given the 192px menu width and right anchoring: keeps the menu from being pushed off the left edge of the screen */
const DOC_MENU_MIN_RIGHT = 208;

/** Max height of the category menu, used to compute how far to shift up near the bottom.
 *  The longest one is a regular folder: new doc / new subfolder + two imports + move / rename / delete, 7 items,
 *  plus 2 dividers and the panel's own vertical padding; at about 36px per item that comes to 280 */
const CAT_MENU_MAX_HEIGHT = 280;

/**
 * The workspace's three popup menus. Both the sidebar and the list scroll, so menus are always fixed-positioned;
 * we only store the trigger's viewport coordinates here, and each menu component portals into body to render.
 *
 * All returned callbacks are stabilized with useCallback: menu components use them for keydown / outside-click listeners,
 * and a new closure every render would attach and detach those listeners each time (especially wasteful with dozens of list rows).
 * toggle needs "close if the same one is already open", which reads the old value via setState's updater to keep state out of deps.
 */
export function useMenus() {
  const [docMenu, setDocMenu] = useState<DocMenuAnchor | null>(null);
  const [catMenu, setCatMenu] = useState<CatMenuAnchor | null>(null);
  const [accountMenu, setAccountMenu] = useState<AccountMenuAnchor | null>(null);

  /** Right-click opens the doc menu: the anchor follows the mouse, with the right anchor clamped when right-clicking near the left edge (sidebar) */
  const openDocMenuAt = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDocMenu({
      id,
      top: e.clientY + 2,
      right: Math.min(window.innerWidth - e.clientX, window.innerWidth - DOC_MENU_MIN_RIGHT),
    });
  }, []);

  /** Right-click opens the category menu (including the root "Recently opened"); shifts up near the bottom of the screen so it doesn't overflow */
  const openCatMenuAt = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCatMenu({
      path,
      top: Math.min(e.clientY + 2, window.innerHeight - CAT_MENU_MAX_HEIGHT),
      left: e.clientX,
    });
  }, []);

  /** The "···" button: collapses if the same target is already open, otherwise opens below the button.
   *  The button has data-menu-trigger and doesn't trigger the menu's own outside-dismiss, so the other menu is closed manually here */
  const toggleDocMenuAt = useCallback((e: React.MouseEvent<HTMLElement>, id: string) => {
    e.stopPropagation();
    setCatMenu(null);
    // currentTarget is nulled by React by the time a deferred updater runs, so coordinates must be read now
    const r = e.currentTarget.getBoundingClientRect();
    setDocMenu((prev) =>
      prev?.id === id ? null : { id, top: r.bottom + 4, right: window.innerWidth - r.right }
    );
  }, []);

  const toggleCatMenuAt = useCallback((e: React.MouseEvent<HTMLElement>, path: string) => {
    e.stopPropagation();
    setDocMenu(null);
    const r = e.currentTarget.getBoundingClientRect();
    setCatMenu((prev) => (prev?.path === path ? null : { path, top: r.bottom + 4, left: r.left }));
  }, []);

  const toggleAccountMenu = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAccountMenu((prev) =>
      prev
        ? null
        : {
            bottom: window.innerHeight - r.top + 6,
            left: r.left,
            width: r.width,
          }
    );
  }, []);

  const closeDocMenu = useCallback(() => setDocMenu(null), []);
  const closeCatMenu = useCallback(() => setCatMenu(null), []);
  const closeAccountMenu = useCallback(() => setAccountMenu(null), []);

  return {
    docMenu,
    closeDocMenu,
    openDocMenuAt,
    toggleDocMenuAt,
    catMenu,
    closeCatMenu,
    openCatMenuAt,
    toggleCatMenuAt,
    accountMenu,
    closeAccountMenu,
    toggleAccountMenu,
  };
}

