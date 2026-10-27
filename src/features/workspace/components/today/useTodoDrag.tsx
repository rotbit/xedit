"use client";

/**
 * Today page "drag a todo to change its date": drag a todo onto a day in the right column (or back onto the left column's today list) and drop to move it there.
 *
 * Why native HTML5 drag and drop instead of something like dnd-kit: there are only two actions — "drag a whole row onto a day" and "drag a checklist row
 * up / down within the today list" — with no cross-container sorting or animated reflow.
 * Native events take a few dozen lines, not worth another dependency; native DnD is good enough for desktop mouse use.
 * Reordering is persisted as line order in the checklist doc (reorderTask), so there's no order state here beyond the hover indicator.
 * Native DnD is basically unusable on touch screens, which still use the row-end "Change date" menu — dragging is just an extra path; the menu is always there.
 *
 * State (which item is being dragged, which day is hovered) lives in Context: drag sources are rows in both columns and drop targets are spread across both too,
 * so TodayView provides it once, and rows and targets just spread the dragProps / dropProps helpers onto elements.
 */
import { createContext, useContext, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { TodoItem } from "@/lib/todos/collect";
import { rowId, type RowActions } from "./parts";

/** How long hovering over a merged empty-days row while dragging takes to auto-expand it into single days, so the user can keep dragging to a specific one */
const LINGER_MS = 400;

interface DropOptions {
  /** Whether this drop target accepts this item; if not, skip preventDefault so the cursor shows not-allowed and dropping does nothing */
  accept?: (item: TodoItem) => boolean;
  /** Called after hovering longer than LINGER_MS (used by merged rows to auto-expand) */
  onLinger?: () => void;
}

/** Where a reorder drop lands relative to the hovered row: above or below it, by which half of the row the pointer is in */
export type RowPlace = "before" | "after";

interface DragHandlers {
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

interface TodoDrag {
  dragProps: (item: TodoItem) => {
    draggable: boolean;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: () => void;
  };
  dropProps: (day: string, opts?: DropOptions) => DragHandlers;
  /** Make a today-list row a reorder target; rows that aren't reorderable simply don't accept, and the drag falls through to the list's day target */
  rowDropProps: (item: TodoItem) => DragHandlers;
  /** Where the insertion line should be drawn on this row while a reorder drag hovers it; null if not hovered */
  rowIndicator: (item: TodoItem) => RowPlace | null;
  /** Whether this row is being dragged (drawn semi-transparent) */
  isDragging: (item: TodoItem) => boolean;
  /** An item is being dragged over this day's drop target (target highlighted) */
  isOver: (day: string) => boolean;
}

/** Upper half of the hovered row inserts above it, lower half below */
function placeOf(e: DragEvent): RowPlace {
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientY < r.top + r.height / 2 ? "before" : "after";
}

const Ctx = createContext<TodoDrag | null>(null);

export function TodoDragProvider({ actions, children }: { actions: RowActions; children: ReactNode }) {
  const [dragging, setDragging] = useState<TodoItem | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [overRow, setOverRow] = useState<{ id: string; place: RowPlace } | null>(null);
  // Expand timer for merged rows: only one target is hovered at a time, so one timer suffices; remember which day it belongs to so repeated dragover doesn't restart it
  const linger = useRef<{ day: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const stopLinger = () => {
    if (linger.current) clearTimeout(linger.current.timer);
    linger.current = null;
  };
  useEffect(() => stopLinger, []);

  const reset = () => {
    stopLinger();
    setDragging(null);
    setOverDay(null);
    setOverRow(null);
  };

  // Dragging onto the day it's already on is a no-op, not a drop target: cursor shows not-allowed and it snaps back on drop
  const accepts = (day: string, opts?: DropOptions) =>
    dragging !== null && day !== dragging.due && (opts?.accept?.(dragging) ?? true);

  // Reordering only happens between two distinct reorderable rows (same checklist doc; reorderTask re-checks that on write)
  const acceptsRow = (item: TodoItem) =>
    dragging !== null && rowId(dragging) !== rowId(item) && actions.reorderable(dragging) && actions.reorderable(item);

  const value: TodoDrag = {
    dragProps: (item) => ({
      draggable: true,
      onDragStart: (e) => {
        // With the menu open the row contains interactive things like the date input; dragging from there would drag the whole row by mistake, so cancel this drag
        if (actions.menuId !== null) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        // Firefox won't actually start dragging without setData
        e.dataTransfer.setData("text/plain", item.text);
        setDragging(item);
      },
      // Dropping outside a target or cancelling with Esc is only seen here; after dropping elsewhere the source row may have unmounted, so onDrop clears too
      onDragEnd: reset,
    }),
    dropProps: (day, opts) => ({
      onDragOver: (e) => {
        // No todo being dragged (e.g. a file dragged in from the desktop): don't intercept, let the rest of the page handle it
        if (!accepts(day, opts)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOverDay(day);
        if (opts?.onLinger && linger.current?.day !== day) {
          stopLinger();
          const onLinger = opts.onLinger;
          const timer = setTimeout(() => {
            linger.current = null;
            onLinger();
          }, LINGER_MS);
          linger.current = { day, timer };
        }
      },
      onDragLeave: (e) => {
        // Moving between children inside the target also fires dragleave; only clear on a real leave, or the highlight flickers
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        if (linger.current?.day === day) stopLinger();
        setOverDay((d) => (d === day ? null : d));
      },
      onDrop: (e) => {
        e.preventDefault();
        const item = dragging;
        if (item && accepts(day, opts)) {
          // Same semantics as picking today / tomorrow in the menu (MoveMenu's moveStart): keep the end date, drop it if earlier than the new start
          actions.onMove(item, { due: day, end: item.end && item.end > day ? item.end : null });
        }
        reset();
      },
    }),
    rowDropProps: (item) => ({
      onDragOver: (e) => {
        // Not a reorder: leave the event alone so it bubbles to the list container's "today" day target (or shows not-allowed)
        if (!acceptsRow(item)) return;
        e.preventDefault();
        // The row sits inside the list's day drop target; without this the container would also highlight as a date-change target
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        const place = placeOf(e);
        const id = rowId(item);
        // dragover fires continuously; only set state when it actually changes, to avoid re-rendering the page on every mouse move
        setOverRow((o) => (o && o.id === id && o.place === place ? o : { id, place }));
        setOverDay(null);
      },
      onDragLeave: (e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        const id = rowId(item);
        setOverRow((o) => (o?.id === id ? null : o));
      },
      onDrop: (e) => {
        if (!acceptsRow(item) || !dragging) return;
        e.preventDefault();
        e.stopPropagation();
        // Recompute from the drop point rather than trusting overRow: the last dragover may lag the pointer by a frame
        actions.onReorder(dragging, item, placeOf(e));
        reset();
      },
    }),
    rowIndicator: (item) => (dragging !== null && overRow?.id === rowId(item) ? overRow.place : null),
    isDragging: (item) => dragging !== null && rowId(dragging) === rowId(item),
    isOver: (day) => dragging !== null && overDay === day,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTodoDrag(): TodoDrag {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTodoDrag must be used inside TodoDragProvider");
  return v;
}

/** Drag gesture styles for a row: draggable rows show a grab cursor, the one being dragged is semi-transparent */
export function dragRowCls(drag: TodoDrag, item: TodoItem): string {
  return `cursor-grab active:cursor-grabbing ${drag.isDragging(item) ? "opacity-40" : ""}`;
}
