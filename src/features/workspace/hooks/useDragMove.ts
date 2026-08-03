"use client";

import { useState } from "react";
import { ALL, UNCATEGORIZED } from "../constants";
import { allCategories, canNestCategory } from "../lib/catTree";
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

/** 落点：中间=放入（成为子级/移入分类），上下边缘=插到该行前/后（手动排序） */
export interface DropSpot {
  kind: "cat" | "doc";
  /** 分类路径（或 ALL 根）/ 文档 id */
  key: string;
  zone: "into" | "before" | "after";
}

interface Params {
  docs: DocMeta[] | null;
  customCats: string[];
  expanded: Set<string>;
  expandOne: (path: string) => void;
  moveDoc: (doc: DocMeta, category: string) => void;
  moveCategory: (path: string, parent: string) => void;
  /** 把分类插到 target 的前/后（跨父级时连带迁移） */
  reorderCategory: (path: string, targetPath: string, zone: "before" | "after") => void;
  /** 把文章插到 target 文章的前/后（跨分类时连带移动） */
  reorderDoc: (id: string, targetId: string, zone: "before" | "after") => void;
}

const parentOf = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

/** 指针在行内的纵向位置 → 落区。edge 是上下边缘占比 */
function zoneOf(e: React.DragEvent, edge: number): "before" | "after" | "into" {
  const rect = e.currentTarget.getBoundingClientRect();
  const y = (e.clientY - rect.top) / Math.max(rect.height, 1);
  if (y < edge) return "before";
  if (y > 1 - edge) return "after";
  return "into";
}

/**
 * 鼠标拖拽：文章/分类拖到侧栏行上。
 * 行中部=移入该分类；行边缘=插到该行前后调整先后顺序（跨父级/跨分类时连带迁移）。
 */
export function useDragMove({
  docs,
  customCats,
  expanded,
  expandOne,
  moveDoc,
  moveCategory,
  reorderCategory,
  reorderDoc,
}: Params) {
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropSpot, setDropSpot] = useState<DropSpot | null>(null);

  const endDrag = () => {
    cancelDragExpand();
    setDragItem(null);
    setDropSpot(null);
  };

  /** 分类拖拽能否「放入」parent（空串=顶级）或在其下插排 */
  const catCanGo = (path: string, parent: string, sameParentOk: boolean): boolean => {
    if (sameParentOk && parentOf(path) === parent) return true;
    return canNestCategory(path, parent, allCategories(customCats, docs));
  };

  /** 文章能否移入分类 target（ALL = 未分类） */
  const docCanMoveTo = (id: string, target: string): boolean => {
    const doc = (docs ?? []).find((d) => d.id === id);
    if (!doc) return false;
    return (doc.category || UNCATEGORIZED) !== (target === ALL ? UNCATEGORIZED : target);
  };

  /** 判定分类行上的落点；null = 不可落 */
  const spotOnCat = (e: React.DragEvent, target: string): DropSpot | null => {
    if (!dragItem) return null;
    if (dragItem.kind === "doc") {
      // 文章拖到分类行：整行都是「移入」
      return docCanMoveTo(dragItem.id, target) ? { kind: "cat", key: target, zone: "into" } : null;
    }
    const path = dragItem.path;
    if (path === UNCATEGORIZED) return null;
    if (target === ALL) {
      // 根节点：提升为顶级
      return catCanGo(path, "", false) ? { kind: "cat", key: ALL, zone: "into" } : null;
    }
    if (target === path || target.startsWith(`${path}/`)) return null; // 自己或子孙
    const zone = zoneOf(e, 0.28);
    if (zone === "into") {
      return catCanGo(path, target, false) ? { kind: "cat", key: target, zone } : null;
    }
    // 边缘：插到 target 的前/后（同父=纯排序，跨父=迁移+排序）
    return catCanGo(path, parentOf(target), true)
      ? { kind: "cat", key: target, zone }
      : null;
  };

  /** 判定文章行上的落点（只接文章拖拽）；null = 不可落 */
  const spotOnDoc = (e: React.DragEvent, target: DocMeta): DropSpot | null => {
    if (dragItem?.kind !== "doc" || dragItem.id === target.id) return null;
    const zone = zoneOf(e, 0.5);
    return { kind: "doc", key: target.id, zone: zone === "into" ? "after" : zone };
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

  const acceptSpot = (
    e: React.DragEvent,
    spot: DropSpot | null,
    rowKind: DropSpot["kind"],
    rowKey: string
  ) => {
    if (!spot) {
      // 同一行内从可落区滑进不可落区（如边缘→中间）时清掉残留高亮
      setDropSpot((prev) => (prev && prev.kind === rowKind && prev.key === rowKey ? null : prev));
      cancelDragExpand();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropSpot((prev) =>
      prev && prev.kind === spot.kind && prev.key === spot.key && prev.zone === spot.zone
        ? prev
        : spot
    );
    // 悬停「放入」折叠分类片刻自动展开，便于往更深层拖放
    cancelDragExpand();
    if (spot.zone === "into" && rowKind === "cat" && rowKey !== ALL && !expanded.has(rowKey)) {
      scheduleDragExpand(() => expandOne(rowKey));
    }
  };

  const clearSpot = (e: React.DragEvent, kind: DropSpot["kind"], key: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDropSpot((prev) => (prev && prev.kind === kind && prev.key === key ? null : prev));
    cancelDragExpand();
  };

  /** 分类行（及根节点）的落点属性 */
  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => acceptSpot(e, spotOnCat(e, target), "cat", target),
    onDragLeave: (e: React.DragEvent) => clearSpot(e, "cat", target),
    onDrop: (e: React.DragEvent) => {
      const spot = spotOnCat(e, target);
      const item = dragItem;
      endDrag();
      if (!spot || !item) return;
      e.preventDefault();
      e.stopPropagation();
      if (item.kind === "doc") {
        const doc = (docs ?? []).find((d) => d.id === item.id);
        if (doc) moveDoc(doc, target === ALL ? UNCATEGORIZED : target);
        return;
      }
      if (spot.zone === "into") {
        moveCategory(item.path, target === ALL ? "" : target);
      } else {
        reorderCategory(item.path, target, spot.zone);
      }
    },
  });

  /** 侧栏文章行的落点属性：上/下半区插到该文章前/后 */
  const docDropProps = (target: DocMeta) => ({
    onDragOver: (e: React.DragEvent) => acceptSpot(e, spotOnDoc(e, target), "doc", target.id),
    onDragLeave: (e: React.DragEvent) => clearSpot(e, "doc", target.id),
    onDrop: (e: React.DragEvent) => {
      const spot = spotOnDoc(e, target);
      const item = dragItem;
      endDrag();
      if (!spot || !item || item.kind !== "doc" || spot.zone === "into") return;
      e.preventDefault();
      e.stopPropagation();
      reorderDoc(item.id, target.id, spot.zone);
    },
  });

  /** 正在被拖动的行/卡片降透明度 */
  const isDragging = (item: DragItem): boolean =>
    dragItem?.kind === item.kind &&
    (item.kind === "doc"
      ? dragItem.kind === "doc" && dragItem.id === item.id
      : dragItem.kind === "cat" && dragItem.path === item.path);

  return { dragItem, dropSpot, dragSrcProps, dropProps, docDropProps, isDragging };
}

export type DragMove = ReturnType<typeof useDragMove>;
