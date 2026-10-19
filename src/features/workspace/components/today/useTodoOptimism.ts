"use client";

/**
 * Optimistic updates on the Today page: checking, deleting and moving dates are drawn in the UI first and reverted if the write-back fails.
 *
 * Why not wait for the aggregation to change: while the editor has that doc open, changes go to the store first and hit disk only on autosave,
 * so in between the aggregation still reads the old body and items flash back. All three maps identify items by "key + text"
 * (line numbers shift when lines are deleted), so leftovers can't hit other rows, and there's no rush to clear them after success.
 */
import { useState } from "react";
import { bucketTodos, type TodoBuckets, type TodoItem } from "@/lib/todos/collect";
import type { DueRange } from "@/lib/todos/parse";

type ItemMap = Map<string, TodoItem>;

/** The todo's current dates (start + end); null if undated */
type Span = DueRange | null;
const spanOf = (i: TodoItem): Span => (i.due ? { due: i.due, end: i.end } : null);
const sameSpan = (a: Span, b: Span) => (a?.due ?? null) === (b?.due ?? null) && (a?.end ?? null) === (b?.end ?? null);

/** How long a checked item stays struck through before moving to "Done" */
const SETTLE_MS = 800;

const sameIn = (map: Map<string, { text: string }>, item: TodoItem) => map.get(item.key)?.text === item.text;

function withEntry<V>(prev: Map<string, V>, key: string, value: V | null): Map<string, V> {
  const next = new Map(prev);
  if (value === null) next.delete(key);
  else next.set(key, value);
  return next;
}

export interface TodoOptimism {
  /** Buckets re-split after applying deletes / date moves */
  buckets: TodoBuckets;
  /** Just checked and still drawn done in place (lingering before moving to "Done"), and no longer in the overdue / today buckets */
  doneOnly: TodoItem[];
  isDone: (item: TodoItem) => boolean;
  toggle: (item: TodoItem, checked: boolean) => Promise<void>;
  remove: (item: TodoItem) => Promise<void>;
  move: (item: TodoItem, range: DueRange | null) => Promise<void>;
}

export function useTodoOptimism(
  items: TodoItem[],
  today: string,
  write: {
    toggle: (item: TodoItem, checked: boolean) => Promise<boolean>;
    remove: (item: TodoItem) => Promise<boolean>;
    move: (item: TodoItem, range: DueRange | null) => Promise<boolean>;
  }
): TodoOptimism {
  const [justDone, setJustDone] = useState<ItemMap>(() => new Map());
  // After checking, it stays struck through in place for a moment before moving to "Done": once in this map it's hidden from the list.
  // Can't rely on the aggregation alone: while the editor has that doc open the change hits disk only on autosave, and meanwhile the aggregation still reads it unchecked;
  // without hiding it, it would flash back into the list as not done
  const [settled, setSettled] = useState<ItemMap>(() => new Map());
  // Page crossed midnight: daily tasks checked yesterday are undone again today, so the "just checked" records must be invalidated (reset during render by date)
  const [doneDay, setDoneDay] = useState(today);
  if (doneDay !== today) {
    setDoneDay(today);
    setJustDone(new Map());
    setSettled(new Map());
  }
  const [removed, setRemoved] = useState<ItemMap>(() => new Map());
  // Date moves record "from → to" (both start and end): they override only while the aggregation still shows the old date (from);
  // once the body is saved (or the user changed the date in the doc) a different value is read and the record lapses on its own, never masking real data
  const [moved, setMoved] = useState<Map<string, { text: string; from: Span; due: Span }>>(() => new Map());

  const adjusted = items
    .filter((i) => !sameIn(removed, i) && !sameIn(settled, i))
    .map((i) => {
      const m = moved.get(i.key);
      const now = spanOf(i);
      return m && m.text === i.text && sameSpan(m.from, now) && !sameSpan(m.due, now)
        ? // A daily task whose date was moved becomes a regular single-day todo (setTaskLineDue replaced the repeat tag)
          { ...i, due: m.due?.due ?? null, end: m.due?.end ?? null, repeat: null }
        : i;
    });
  const buckets = bucketTodos(adjusted, today);
  const active = [...buckets.overdue, ...buckets.today];
  const doneOnly = [...justDone.values()].filter(
    (i) => !sameIn(removed, i) && !sameIn(settled, i) && !active.some((a) => a.key === i.key && a.text === i.text)
  );

  const toggle = async (item: TodoItem, checked: boolean) => {
    setJustDone((p) => withEntry(p, item.key, checked ? item : null)); // Draw it first; checking should feel instant
    if (!checked) setSettled((p) => withEntry(p, item.key, null));
    if (!(await write.toggle(item, checked))) {
      setJustDone((p) => withEntry(p, item.key, checked ? null : item));
      return;
    }
    // Only move it once the write succeeds: the strike-through lingers so people can see which one was checked, then it leaves the list and appears in "Done"
    if (checked) setTimeout(() => setSettled((p) => withEntry(p, item.key, item)), SETTLE_MS);
  };

  /** Delete without confirmation: it only removes one line from the body, low cost */
  const remove = async (item: TodoItem) => {
    setRemoved((p) => withEntry(p, item.key, item));
    if (!(await write.remove(item))) setRemoved((p) => withEntry(p, item.key, null));
  };

  const move = async (item: TodoItem, range: DueRange | null) => {
    const before = moved.get(item.key) ?? null;
    // item may already carry an optimistic date; "from" must come from the real value in the aggregation, or moving twice in a row flashes back
    const from = spanOf(items.find((i) => i.key === item.key && i.text === item.text) ?? item);
    setMoved((p) => withEntry(p, item.key, { text: item.text, from, due: range }));
    if (!(await write.move(item, range))) setMoved((p) => withEntry(p, item.key, before));
  };

  return { buckets, doneOnly, isDone: (item) => sameIn(justDone, item), toggle, remove, move };
}
