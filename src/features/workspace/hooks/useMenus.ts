"use client";

import { useCallback, useState } from "react";

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

/** 分类菜单的最大高度，用来算贴底时该上移多少。
 *  最长的一份是普通文件夹：新建文章 / 新建子文件夹 + 两条导入 + 移动 / 重命名 / 删除 共 7 条，
 *  外加 2 条分隔线与面板自身的上下内边距，按约 36px 一条估到 280 */
const CAT_MENU_MAX_HEIGHT = 280;

/**
 * 工作台的三个弹出菜单。侧栏与列表都可滚动，菜单一律 fixed 定位，
 * 因此这里只保存触发点的视口坐标，由各菜单组件 portal 到 body 渲染。
 *
 * 返回的回调全部 useCallback 稳住：菜单组件拿它们去挂 keydown / 外部点击监听，
 * 每渲染换一份新闭包就会让这些监听跟着装卸一轮（列表几十行时尤其浪费）。
 * toggle 里要「已开同一个就收起」，靠 setState 的 updater 读旧值，避免把 state 写进依赖。
 */
export function useMenus() {
  const [docMenu, setDocMenu] = useState<DocMenuAnchor | null>(null);
  const [catMenu, setCatMenu] = useState<CatMenuAnchor | null>(null);
  const [accountMenu, setAccountMenu] = useState<AccountMenuAnchor | null>(null);

  /** 右键唤出文档菜单：锚点跟随鼠标，在屏幕左缘（侧栏）右键时钳制右锚 */
  const openDocMenuAt = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDocMenu({
      id,
      top: e.clientY + 2,
      right: Math.min(window.innerWidth - e.clientX, window.innerWidth - DOC_MENU_MIN_RIGHT),
    });
  }, []);

  /** 右键唤出分类菜单（含根节点「全部文章」）；靠近屏幕底部时上移，避免菜单溢出 */
  const openCatMenuAt = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCatMenu({
      path,
      top: Math.min(e.clientY + 2, window.innerHeight - CAT_MENU_MAX_HEIGHT),
      left: e.clientX,
    });
  }, []);

  /** 「···」按钮：已展开同一目标则收起，否则贴按钮下沿展开。
   *  按钮带 data-menu-trigger，不触发菜单自己的外部关闭，所以另一个菜单在这里手动关 */
  const toggleDocMenuAt = useCallback((e: React.MouseEvent<HTMLElement>, id: string) => {
    e.stopPropagation();
    setCatMenu(null);
    // currentTarget 在延后执行的 updater 里已被 React 置空，坐标必须现在读
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

