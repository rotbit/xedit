"use client";

import { useState } from "react";

/** 文档菜单锚点：右锚定位，避免菜单被列表容器裁剪 */
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

/** 账户菜单贴着侧栏底部的触发行向上弹出 */
export interface AccountMenuAnchor {
  bottom: number;
  left: number;
  width: number;
}

/** 菜单宽 192px + 右锚定位时，右锚的下限：防止菜单被推出屏幕左缘 */
const DOC_MENU_MIN_RIGHT = 208;

/**
 * 工作台的三个弹出菜单。侧栏与列表都可滚动，菜单一律 fixed 定位，
 * 因此这里只保存触发点的视口坐标，由各菜单组件 portal 到 body 渲染。
 */
export function useMenus() {
  const [docMenu, setDocMenu] = useState<DocMenuAnchor | null>(null);
  const [catMenu, setCatMenu] = useState<CatMenuAnchor | null>(null);
  const [accountMenu, setAccountMenu] = useState<AccountMenuAnchor | null>(null);

  /** 右键唤出文档菜单：锚点跟随鼠标，在屏幕左缘（侧栏）右键时钳制右锚 */
  const openDocMenuAt = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDocMenu({
      id,
      top: e.clientY + 2,
      right: Math.min(window.innerWidth - e.clientX, window.innerWidth - DOC_MENU_MIN_RIGHT),
    });
  };

  /** 右键唤出分类菜单（含根节点「全部文章」）；靠近屏幕底部时上移，避免菜单溢出 */
  const openCatMenuAt = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCatMenu({
      path,
      top: Math.min(e.clientY + 2, window.innerHeight - 200),
      left: e.clientX,
    });
  };

  /** 「···」按钮：已展开同一目标则收起，否则贴按钮下沿展开 */
  const toggleDocMenuAt = (e: React.MouseEvent<HTMLElement>, id: string) => {
    e.stopPropagation();
    if (docMenu?.id === id) {
      setDocMenu(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setDocMenu({ id, top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  const toggleCatMenuAt = (e: React.MouseEvent<HTMLElement>, path: string) => {
    e.stopPropagation();
    if (catMenu?.path === path) {
      setCatMenu(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setCatMenu({ path, top: r.bottom + 4, left: r.left });
  };

  const toggleAccountMenu = (e: React.MouseEvent<HTMLElement>) => {
    if (accountMenu) {
      setAccountMenu(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setAccountMenu({
      bottom: window.innerHeight - r.top + 6,
      left: r.left,
      width: r.width,
    });
  };

  return {
    docMenu,
    closeDocMenu: () => setDocMenu(null),
    openDocMenuAt,
    toggleDocMenuAt,
    catMenu,
    closeCatMenu: () => setCatMenu(null),
    openCatMenuAt,
    toggleCatMenuAt,
    accountMenu,
    closeAccountMenu: () => setAccountMenu(null),
    toggleAccountMenu,
  };
}

export type Menus = ReturnType<typeof useMenus>;
