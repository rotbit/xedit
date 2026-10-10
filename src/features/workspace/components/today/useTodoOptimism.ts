"use client";

/**
 * 今天页的乐观更新：勾选、删除、挪日期都先画到界面上，写回失败再撤。
 *
 * 为什么不等汇总自己变：编辑器正开着那篇时，改动先进 store、要等自动保存才落盘，
 * 期间汇总读到的还是旧正文，条目会闪回原处。三张表都靠「key + 文字」认条目
 * （行号会因删行前移），留着也不会误伤别的行，所以成功后不急着清。
 */
import { useState } from "react";
import { bucketTodos, type TodoBuckets, type TodoItem } from "@/lib/todos/collect";
import type { DueRange } from "@/lib/todos/parse";

type ItemMap = Map<string, TodoItem>;

/** 待办此刻的日期（开始 + 结束）；没日期为 null */
type Span = DueRange | null;
const spanOf = (i: TodoItem): Span => (i.due ? { due: i.due, end: i.end } : null);
const sameSpan = (a: Span, b: Span) => (a?.due ?? null) === (b?.due ?? null) && (a?.end ?? null) === (b?.end ?? null);

/** 勾掉后划线停留多久再落到「做完了」 */
const SETTLE_MS = 800;

const sameIn = (map: Map<string, { text: string }>, item: TodoItem) => map.get(item.key)?.text === item.text;

function withEntry<V>(prev: Map<string, V>, key: string, value: V | null): Map<string, V> {
  const next = new Map(prev);
  if (value === null) next.delete(key);
  else next.set(key, value);
  return next;
}

export interface TodoOptimism {
  /** 套上删除 / 挪日期之后重新分的桶 */
  buckets: TodoBuckets;
  /** 刚勾掉、还在原地画成已完成的（停留一下再落到「做完了」），且已不在逾期 / 今天桶里的 */
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
  // 勾掉后在原地划线停一下再落到「做完了」：进了这张表就从列表里藏起来。
  // 不能只靠汇总自己变：编辑器正开着那篇时改动要等自动保存才落盘，期间汇总读到的还是没勾的，
  // 不藏的话它会以未完成的样子闪回列表
  const [settled, setSettled] = useState<ItemMap>(() => new Map());
  // 页面跨过零点：昨天勾掉的每日任务今天又该是没做，「刚勾掉」的记录得跟着作废（渲染期按日期重置）
  const [doneDay, setDoneDay] = useState(today);
  if (doneDay !== today) {
    setDoneDay(today);
    setJustDone(new Map());
    setSettled(new Map());
  }
  const [removed, setRemoved] = useState<ItemMap>(() => new Map());
  // 挪日期记下「从哪挪到哪」（开始日与结束日都记）：只在汇总还显示旧日期（from）时才覆盖，
  // 一旦正文落盘（或用户又在文章里改了日期）读到别的值，这条记录就自动失效，不会盖住真实数据
  const [moved, setMoved] = useState<Map<string, { text: string; from: Span; due: Span }>>(() => new Map());

  const adjusted = items
    .filter((i) => !sameIn(removed, i) && !sameIn(settled, i))
    .map((i) => {
      const m = moved.get(i.key);
      const now = spanOf(i);
      return m && m.text === i.text && sameSpan(m.from, now) && !sameSpan(m.due, now)
        ? // 挪过日期的每日任务就成了普通单日待办（setTaskLineDue 换掉了重复标签）
          { ...i, due: m.due?.due ?? null, end: m.due?.end ?? null, repeat: null }
        : i;
    });
  const buckets = bucketTodos(adjusted, today);
  const active = [...buckets.overdue, ...buckets.today];
  const doneOnly = [...justDone.values()].filter(
    (i) => !sameIn(removed, i) && !sameIn(settled, i) && !active.some((a) => a.key === i.key && a.text === i.text)
  );

  const toggle = async (item: TodoItem, checked: boolean) => {
    setJustDone((p) => withEntry(p, item.key, checked ? item : null)); // 先画上，勾选要即时
    if (!checked) setSettled((p) => withEntry(p, item.key, null));
    if (!(await write.toggle(item, checked))) {
      setJustDone((p) => withEntry(p, item.key, checked ? null : item));
      return;
    }
    // 写成功了才落下去：划线停留一下让人看清是哪条勾掉了，再从列表消失、出现在「做完了」
    if (checked) setTimeout(() => setSettled((p) => withEntry(p, item.key, item)), SETTLE_MS);
  };

  /** 删除不弹确认：删的只是正文里的一行，代价小 */
  const remove = async (item: TodoItem) => {
    setRemoved((p) => withEntry(p, item.key, item));
    if (!(await write.remove(item))) setRemoved((p) => withEntry(p, item.key, null));
  };

  const move = async (item: TodoItem, range: DueRange | null) => {
    const before = moved.get(item.key) ?? null;
    // item 可能已经套过一次乐观日期，「从哪挪」要以汇总里的真实值为准，连挪两次才不会闪回
    const from = spanOf(items.find((i) => i.key === item.key && i.text === item.text) ?? item);
    setMoved((p) => withEntry(p, item.key, { text: item.text, from, due: range }));
    if (!(await write.move(item, range))) setMoved((p) => withEntry(p, item.key, before));
  };

  return { buckets, doneOnly, isDone: (item) => sameIn(justDone, item), toggle, remove, move };
}
