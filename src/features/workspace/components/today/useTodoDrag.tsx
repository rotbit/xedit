"use client";

/**
 * Today page "drag a todo to change its date": drag a todo onto a day in the right column (or back onto the left column's today list) and drop to move it there.
 *
 * Why native HTML5 drag and drop instead of something like dnd-kit: there are only two actions — "drag a whole row onto a day" and "drag a checklist row
 * up / down within the today list" — with no cross-container sorting. The reorder reflow ("rows slide aside to make room") is a translateY per row
 * computed by lib/dragShift; native events plus that take far less than another dependency, and native DnD is good enough for desktop mouse use.
 * Reordering is persisted as line order in the checklist doc (reorderTask), so there's no order state here beyond the visual shifts.
 * Native DnD is basically unusable on touch screens, which still use the row-end "Change date" menu — dragging is just an extra path; the menu is always there.
 *
 * State (which item is being dragged, which day is hovered) lives in Context: drag sources are rows in both columns and drop targets are spread across both too,
 * so TodayView provides it once, and rows and targets just spread the dragProps / dropProps helpers onto elements.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import type { TodoItem } from "@/lib/todos/collect";
import {
  SHIFT_TRANSITION,
  computeShifts,
  hitRow,
  measureRows,
  placeIn,
  sameShifts,
  shiftTransform,
  type DragGap,
  type Shifts,
} from "../../lib/dragShift";
import { rowId, type RowActions } from "./parts";

/** How long hovering over a merged empty-days row while dragging takes to auto-expand it into single days, so the user can keep dragging to a specific one */
const LINGER_MS = 400;

/** After a reorder drop the shifts are held until the new order renders; if the write fails, give up after this long */
const SETTLE_MS = 1000;

const NO_SHIFTS: Shifts = new Map();

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
  /**
   * Reorder target for the today list container (the element holding the rows). Hit-tests rows by pointer position;
   * pointers over rows that aren't reorderable fall through to the list's day target
   */
  listReorderProps: () => DragHandlers;
  /** translateY that slides this row aside (or, for the dragged row, into the gap) while reordering */
  rowStyle: (item: TodoItem) => CSSProperties;
  /** A drag is in progress: rows animate their shifts (and snap back without animation once it ends) */
  active: boolean;
  /** Whether this row is being dragged (drawn semi-transparent) */
  isDragging: (item: TodoItem) => boolean;
  /** An item is being dragged over this day's drop target (target highlighted) */
  isOver: (day: string) => boolean;
}

const Ctx = createContext<TodoDrag | null>(null);

export function TodoDragProvider({
  actions,
  rows,
  children,
}: {
  actions: RowActions;
  /** Today-list rows in display order: resolves hit rows to items, and its key order tells when a reorder has landed */
  rows: TodoItem[];
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState<TodoItem | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [gap, setGap] = useState<DragGap | null>(null);
  const [shifts, setShifts] = useState<Shifts>(NO_SHIFTS);
  // Row order at the moment of a reorder drop; while set, shifts are held until the order changes (the write is async)
  const [settling, setSettling] = useState<string | null>(null);
  // Expand timer for merged rows: only one target is hovered at a time, so one timer suffices; remember which day it belongs to so repeated dragover doesn't restart it
  const linger = useRef<{ day: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const stopLinger = () => {
    if (linger.current) clearTimeout(linger.current.timer);
    linger.current = null;
  };
  useEffect(() => stopLinger, []);

  const order = rows.map(rowId).join("\n");
  // Held shifts end the moment the new order renders — derived during render, so the reordered rows and the cleared shifts land in the
  // same frame (no transition is active by then, so rows snap straight into place)
  const liveShifts = settling !== null && order !== settling ? NO_SHIFTS : shifts;
  // Fallback when the write fails and the order never changes
  useEffect(() => {
    if (settling === null) return;
    const timer = setTimeout(() => {
      setShifts(NO_SHIFTS);
      setSettling(null);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [settling]);

  const reset = () => {
    stopLinger();
    setDragging(null);
    setOverDay(null);
    setGap(null);
    setShifts(NO_SHIFTS);
    setSettling(null);
  };

  // Dragging onto the day it's already on is a no-op, not a drop target: cursor shows not-allowed and it snaps back on drop
  const accepts = (day: string, opts?: DropOptions) =>
    dragging !== null && day !== dragging.due && (opts?.accept?.(dragging) ?? true);

  // Reordering only happens between two distinct reorderable rows (same checklist doc; reorderTask re-checks that on write)
  const acceptsRow = (item: TodoItem) =>
    dragging !== null && rowId(dragging) !== rowId(item) && actions.reorderable(dragging) && actions.reorderable(item);

  /**
   * Where a reorder drag at clientY lands. "pass" = not a reorder here (let the list's day target handle it);
   * gap null = over the dragged row itself (back to its original slot)
   */
  const reorderAt = (container: HTMLElement, clientY: number) => {
    if (!dragging || !actions.reorderable(dragging)) return "pass" as const;
    const geoms = measureRows(container);
    const hit = hitRow(geoms, clientY);
    if (!hit) return "pass" as const;
    const srcKey = rowId(dragging);
    if (hit.key === srcKey) return { geoms, srcKey, target: null, gap: null };
    const target = rows.find((r) => rowId(r) === hit.key);
    if (!target || !acceptsRow(target)) return "pass" as const;
    const g: DragGap = { key: hit.key, place: placeIn(hit, clientY) };
    return { geoms, srcKey, target, gap: g };
  };

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
        setGap(null);
        setShifts(NO_SHIFTS);
        setSettling(null);
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
    listReorderProps: () => ({
      onDragOver: (e) => {
        const at = reorderAt(e.currentTarget as HTMLElement, e.clientY);
        if (at === "pass") return;
        e.preventDefault();
        // The list sits inside the list's day drop target; without this the container would also highlight as a date-change target
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setOverDay(null);
        // dragover fires continuously; only update when the gap actually moves, to avoid re-rendering the page on every mouse move
        if (gap?.key === at.gap?.key && gap?.place === at.gap?.place) return;
        setGap(at.gap);
        const next = computeShifts(at.geoms, at.srcKey, at.gap);
        setShifts((prev) => (sameShifts(prev, next) ? prev : next));
      },
      onDragLeave: (e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        // Left the list: rows slide back so the dragged one shows in its own slot again
        setGap(null);
        setShifts(NO_SHIFTS);
      },
      onDrop: (e) => {
        // Recompute from the drop point rather than trusting the last gap: the last dragover may lag the pointer by a frame
        const at = reorderAt(e.currentTarget as HTMLElement, e.clientY);
        if (at === "pass" || !dragging) return;
        e.preventDefault();
        e.stopPropagation();
        stopLinger();
        setOverDay(null);
        setGap(null);
        setDragging(null);
        if (!at.target || !at.gap) {
          setShifts(NO_SHIFTS);
          return;
        }
        // Hold the rows where they are (now without transition) until the rewritten order renders, or they'd bounce back for a moment
        setShifts(computeShifts(at.geoms, at.srcKey, at.gap));
        setSettling(order);
        actions.onReorder(dragging, at.target, at.gap.place);
      },
    }),
    rowStyle: (item) => shiftTransform(liveShifts.get(rowId(item))),
    active: dragging !== null,
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

/** Drag gesture styles for a row: draggable rows show a grab cursor, the one being dragged is semi-transparent (it is the preview sitting in the gap) */
export function dragRowCls(drag: TodoDrag, item: TodoItem): string {
  return `cursor-grab active:cursor-grabbing ${drag.isDragging(item) ? "opacity-40" : ""}`;
}

/** Shift animation for every today-list row, draggable or not: only while dragging, so rows snap into place after a drop */
export function shiftRowCls(drag: TodoDrag): string {
  return drag.active ? SHIFT_TRANSITION : "";
}
