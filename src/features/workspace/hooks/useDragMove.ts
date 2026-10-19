"use client";

import { useState } from "react";
import { ALL, UNCATEGORIZED } from "../constants";
import { nameOf, parentOf } from "../lib/catPath";
import { allCategories, canNestCategory } from "../lib/catTree";
import { catKey, docKey } from "../lib/sidebarOrder";
import type { DocMeta, DragItem } from "../types";

/** Timer for auto-expanding a collapsed category while hovering a drag; there's only one drag at a time, so module level is fine */
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

/** Drop zone: middle = drop into (become a child / move into the category), top/bottom edge = insert before/after this row (manual ordering) */
export interface DropSpot {
  kind: "cat" | "doc";
  /** Category path (or the ALL root) / doc id */
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
  /** Insert the dragged item before/after targetKey in host's parent sequence (moving it along when crossing parents/categories) */
  reorderItem: (
    item: DragItem,
    host: string,
    targetKey: string,
    zone: "before" | "after"
  ) => void;
}

/** Pointer's vertical position within the row → drop zone. edge is the fraction taken by the top/bottom edges */
function zoneOf(e: React.DragEvent, edge: number): "before" | "after" | "into" {
  const rect = e.currentTarget.getBoundingClientRect();
  const y = (e.clientY - rect.top) / Math.max(rect.height, 1);
  if (y < edge) return "before";
  if (y > 1 - edge) return "after";
  return "into";
}

/**
 * Mouse drag: docs/categories dragged onto sidebar rows.
 * Middle of a row = move into that category; row edge = insert before/after it to change order (moving along when crossing parents/categories).
 * Folders and docs under the same parent share one display sequence and can be freely interleaved — both drop kinds treat them the same:
 * folder row edge = insert before/after that folder, doc row edge = insert before/after that doc.
 * Dropping a doc on a folder row only "moves in" in the middle band — the edges are a bit narrower as a buffer so aiming to reorder doesn't get swallowed by the folder.
 */
export function useDragMove({
  docs,
  customCats,
  expanded,
  expandOne,
  moveDoc,
  moveCategory,
  reorderItem,
}: Params) {
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropSpot, setDropSpot] = useState<DropSpot | null>(null);

  const endDrag = () => {
    cancelDragExpand();
    setDragItem(null);
    setDropSpot(null);
  };

  /** Whether a category drag can "drop into" parent (empty = top level) or be reordered beneath it */
  const catCanGo = (path: string, parent: string, sameParentOk: boolean): boolean => {
    if (sameParentOk && parentOf(path) === parent) return true;
    return canNestCategory(path, parent, allCategories(customCats, docs));
  };

  /** Whether a doc can move into category target (ALL = uncategorized) */
  const docCanMoveTo = (id: string, target: string): boolean => {
    const doc = (docs ?? []).find((d) => d.id === id);
    if (!doc) return false;
    return (doc.category || UNCATEGORIZED) !== (target === ALL ? UNCATEGORIZED : target);
  };

  /** Determine the drop zone on a category row; null = not droppable */
  const spotOnCat = (e: React.DragEvent, target: string): DropSpot | null => {
    if (!dragItem) return null;
    if (dragItem.kind === "doc") {
      // The root-level blank area has no before/after, so the whole block counts as "move to uncategorized"
      if (target === ALL) {
        return docCanMoveTo(dragItem.id, ALL) ? { kind: "cat", key: ALL, zone: "into" } : null;
      }
      // Doc dragged onto a category row: the middle band is "move in", the top/bottom edges are narrow — when aiming to reorder and the hand slips onto a folder row,
      // the file shouldn't get swallowed into that folder.
      const zone = zoneOf(e, 0.25);
      if (zone === "into") {
        return docCanMoveTo(dragItem.id, target) ? { kind: "cat", key: target, zone: "into" } : null;
      }
      // Edge = insert the doc before/after this folder (the drop belongs to the folder's parent category).
      // Docs and folders are interleaved, so cross-category drops are accepted too — moveDoc runs along with the drop.
      const host = parentOf(target);
      return host ? { kind: "cat", key: target, zone } : null; // Docs can't be placed next to top-level folders
    }
    const path = dragItem.path;
    if (path === UNCATEGORIZED) return null;
    if (target === ALL) {
      // Root node: promote to top level
      return catCanGo(path, "", false) ? { kind: "cat", key: ALL, zone: "into" } : null;
    }
    if (target === path || target.startsWith(`${path}/`)) return null; // Itself or a descendant
    const zone = zoneOf(e, 0.28);
    if (zone === "into") {
      return catCanGo(path, target, false) ? { kind: "cat", key: target, zone } : null;
    }
    // Edge: insert before/after target (same parent = pure reorder, different parent = move + reorder)
    return catCanGo(path, parentOf(target), true)
      ? { kind: "cat", key: target, zone }
      : null;
  };

  /** Determine the drop zone on a doc row; both docs and folders can be inserted before/after this doc. null = not droppable */
  const spotOnDoc = (e: React.DragEvent, target: DocMeta): DropSpot | null => {
    if (!dragItem) return null;
    if (dragItem.kind === "doc") {
      if (dragItem.id === target.id) return null;
    } else {
      const path = dragItem.path;
      if (path === UNCATEGORIZED) return null;
      const host = target.category || UNCATEGORIZED;
      if (host === UNCATEGORIZED) return null; // Uncategorized doesn't take subfolders
      if (host === path || host.startsWith(`${path}/`)) return null; // Itself or a descendant
      if (!catCanGo(path, host, true)) return null;
    }
    const zone = zoneOf(e, 0.5);
    return { kind: "doc", key: target.id, zone: zone === "into" ? "after" : zone };
  };

  /** Common drag-source props (doc cards / list rows / sidebar doc rows / category rows) */
  const dragSrcProps = (item: DragItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      // Firefox only starts a drag after setData
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
      // Clear leftover highlight when sliding from a droppable to a non-droppable zone within the same row (e.g. edge → middle)
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
    // Hovering "drop into" over a collapsed category auto-expands it after a moment, for dropping deeper
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

  /** Drop-target props for category rows (and the root node) */
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
      // Middle = move into this category; edge = insert before/after this folder (docs and folders share one sequence)
      if (item.kind === "doc") {
        const doc = (docs ?? []).find((d) => d.id === item.id);
        if (!doc) return;
        if (spot.zone === "into") moveDoc(doc, target === ALL ? UNCATEGORIZED : target);
        else reorderItem(item, parentOf(target), catKey(nameOf(target)), spot.zone);
        return;
      }
      if (spot.zone === "into") {
        moveCategory(item.path, target === ALL ? "" : target);
      } else {
        reorderItem(item, parentOf(target), catKey(nameOf(target)), spot.zone);
      }
    },
  });

  /** Drop-target props for sidebar doc rows: top/bottom half inserts before/after this doc (accepts both docs and folders) */
  const docDropProps = (target: DocMeta) => ({
    onDragOver: (e: React.DragEvent) => acceptSpot(e, spotOnDoc(e, target), "doc", target.id),
    onDragLeave: (e: React.DragEvent) => clearSpot(e, "doc", target.id),
    onDrop: (e: React.DragEvent) => {
      const spot = spotOnDoc(e, target);
      const item = dragItem;
      endDrag();
      if (!spot || !item || spot.zone === "into") return;
      e.preventDefault();
      e.stopPropagation();
      reorderItem(item, target.category || UNCATEGORIZED, docKey(target.id), spot.zone);
    },
  });

  /** Lower opacity for the row/card being dragged */
  const isDragging = (item: DragItem): boolean =>
    dragItem?.kind === item.kind &&
    (item.kind === "doc"
      ? dragItem.kind === "doc" && dragItem.id === item.id
      : dragItem.kind === "cat" && dragItem.path === item.path);

  return { dragItem, dropSpot, dragSrcProps, dropProps, docDropProps, isDragging };
}

