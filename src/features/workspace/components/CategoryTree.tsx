"use client";

import { ALL, DROP_HL } from "../constants";
import { CategoryRow } from "./CategoryRow";
import type { Workspace } from "../hooks/useWorkspace";

/**
 * 分类树：各分类顶格平铺，没有「全部文章」根行（Obsidian 文件树同款）。
 * 树下方留一块空白区当根级落点——分类拖上去提为顶级、文章拖上去移入未分类，
 * 右键它出根级菜单（新建文章 / 新建文件夹 / 刷新列表）。
 */
export function CategoryTree({ ws }: { ws: Workspace }) {
  const { menus, drag, tree } = ws;
  const rootDrop = drag.dropSpot?.kind === "cat" && drag.dropSpot.key === ALL;

  return (
    <nav className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
      {tree.map((n) => (
        <CategoryRow key={n.path} ws={ws} node={n} depth={0} />
      ))}
      {/* 撑满剩余高度，树再短也有一块能接拖拽与右键的根级空白 */}
      <div
        className={`min-h-10 flex-1 rounded-md ${rootDrop ? DROP_HL : ""}`}
        {...drag.dropProps(ALL)}
        onContextMenu={(e) => menus.openCatMenuAt(e, ALL)}
      />
    </nav>
  );
}
