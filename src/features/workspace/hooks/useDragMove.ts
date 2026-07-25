"use client";

import { useState } from "react";
import { ALL, MAX_DEPTH, UNCATEGORIZED } from "../constants";
import { allCategories } from "../lib/catTree";
import type { DocMeta, DragItem } from "../types";

/** 拖拽悬停自动展开折叠分类的计时器；同一时刻只有一个拖拽，模块级即可 */
let dragExpandTimer: number | null = null;

function cancelDragExpand() {
  if (dragExpandTimer !== null) {
    window.clearTimeout(dragExpandTimer);
    dragExpandTimer = null;
  }
}

function scheduleDragExpand(fn: () => void) {
  cancelDragExpand();
  dragExpandTimer = window.setTimeout(fn, 600);
}

interface Params {
  docs: DocMeta[] | null;
  customCats: string[];
  expanded: Set<string>;
  expandOne: (path: string) => void;
  moveDoc: (doc: DocMeta, category: string) => void;
  moveCategory: (path: string, parent: string) => void;
}

/**
 * 鼠标拖拽移动：文章 / 分类拖到侧栏的分类行（或根节点）上。
 * 落点 target 为分类路径，或 ALL 根节点（分类提为顶级 / 文章移入未分类）。
 */
export function useDragMove({
  docs,
  customCats,
  expanded,
  expandOne,
  moveDoc,
  moveCategory,
}: Params) {
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const endDrag = () => {
    cancelDragExpand();
    setDragItem(null);
    setDropTarget(null);
  };

  /** 当前拖拽对象能否落到 target */
  const canDropOn = (target: string): boolean => {
    if (!dragItem) return false;
    if (dragItem.kind === "doc") {
      const doc = (docs ?? []).find((d) => d.id === dragItem.id);
      if (!doc) return false;
      return (doc.category || UNCATEGORIZED) !== (target === ALL ? UNCATEGORIZED : target);
    }
    const path = dragItem.path;
    const parent = target === ALL ? "" : target;
    if (path === UNCATEGORIZED || parent === UNCATEGORIZED) return false;
    if (parent === path || parent.startsWith(`${path}/`)) return false; // 不能拖进自己或子孙
    const curParent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (parent === curParent) return false;
    // 层级上限：落点深度 + 被拖子树的高度不得超过 MAX_DEPTH
    const height = allCategories(customCats, docs)
      .filter((c) => c === path || c.startsWith(`${path}/`))
      .reduce((h, c) => Math.max(h, c.split("/").length - path.split("/").length + 1), 1);
    return (parent ? parent.split("/").length : 0) + height <= MAX_DEPTH;
  };

  /** 拖拽源通用属性（文章卡片 / 列表行 / 侧栏文章行 / 分类行） */
  const dragSrcProps = (item: DragItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      // Firefox 必须 setData 才会启动拖拽
      e.dataTransfer.setData("text/plain", item.kind === "doc" ? item.id : item.path);
      e.dataTransfer.effectAllowed = "move";
      setDragItem(item);
    },
    onDragEnd: () => endDrag(),
  });

  /** 落点通用属性 */
  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!canDropOn(target)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (dropTarget === target) return;
      setDropTarget(target);
      // 悬停片刻自动展开折叠的分类，便于往更深层拖放
      cancelDragExpand();
      if (target !== ALL && !expanded.has(target)) {
        scheduleDragExpand(() => expandOne(target));
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      if (dropTarget === target) setDropTarget(null);
      cancelDragExpand();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const item = dragItem;
      const ok = item !== null && canDropOn(target);
      endDrag();
      if (!item || !ok) return;
      if (item.kind === "doc") {
        const doc = (docs ?? []).find((d) => d.id === item.id);
        if (doc) moveDoc(doc, target === ALL ? UNCATEGORIZED : target);
      } else {
        moveCategory(item.path, target === ALL ? "" : target);
      }
    },
  });

  /** 正在被拖动的行/卡片降透明度 */
  const isDragging = (item: DragItem): boolean =>
    dragItem?.kind === item.kind &&
    (item.kind === "doc"
      ? dragItem.kind === "doc" && dragItem.id === item.id
      : dragItem.kind === "cat" && dragItem.path === item.path);

  return { dragItem, dropTarget, dragSrcProps, dropProps, isDragging };
}

export type DragMove = ReturnType<typeof useDragMove>;
