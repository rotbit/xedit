"use client";

/**
 * 「要做」一栏：快速输入 + 逾期 / 今天 / 清单里没定日期的待办。
 * 文章里没定日期的、日期在以后的（later 桶）不在这里出现：今天页只放今天该处理的事。
 * 过去某天换成 DoneColumn：列出那天在今天页勾掉的事。
 */
import { useState } from "react";
import type { Locale } from "@/i18n/locale";
import type { TFn } from "@/i18n/t";
import { useLocale, useT } from "@/i18n/useT";
import { formatDue } from "@/lib/todos/dates";
import type { TodoBuckets, TodoItem } from "@/lib/todos/collect";
import type { DayEvent } from "@/lib/todos/events";
import type { DocMeta } from "../../types";
import { ColumnHead, EmptyLine, RemoveButton, TodoBox } from "./parts";
import { QuickAdd, type AddTarget } from "./QuickAdd";

function secondaryOf(item: TodoItem, t: TFn): string | null {
  if (item.source === "doc") return t("文章里的待办 · 《{title}》", { title: item.docTitle });
  if (item.source === "publish") return t("已排期");
  return null; // 待办清单里的就是「自己记的事」，不必再注明出处
}

/** 右侧日期列：今天到期的不标（整页都是今天，再写一遍「今天」是噪音） */
function dueLabel(item: TodoItem, today: string, t: TFn, locale: Locale): { text: string; late: boolean } | null {
  if (!item.due || item.due === today) return null;
  const date = formatDue(item.due, today, locale);
  return item.due < today ? { text: t("{date} 逾期", { date }), late: true } : { text: date, late: false };
}

function TodoRow({
  item,
  done,
  today,
  onToggle,
  onOpen,
  onRemove,
}: {
  item: TodoItem;
  done: boolean;
  today: string;
  onToggle: (() => void) | undefined;
  onOpen: () => void;
  /** 不给就没有删除按钮（发布排期不是正文里的一行，没东西可删） */
  onRemove: (() => void) | undefined;
}) {
  const t = useT();
  const locale = useLocale();
  const due = done ? null : dueLabel(item, today, t, locale);
  const sub = secondaryOf(item, t);
  return (
    <div className="group flex items-start gap-2.5 px-0.5 py-2">
      <TodoBox done={done} onClick={onToggle} label={done ? t("取消完成") : t("标记完成")} />
      <div className="min-w-0 flex-1">
        {/* 点文字去看出处：待办常常要回到文章里才知道具体怎么做 */}
        <button
          type="button"
          className={`cursor-pointer text-left text-[14.5px] leading-[1.45] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-soft)] ${
            done ? "text-[var(--ink-faint)] line-through decoration-[var(--hairline-strong)]" : ""
          }`}
          onClick={onOpen}
        >
          {item.text}
        </button>
        {sub ? <div className="mt-px truncate text-[12.5px] text-[var(--ink-faint)]">{sub}</div> : null}
      </div>
      {due ? (
        <span
          className={`ml-auto mt-[3px] shrink-0 text-[12.5px] tabular-nums ${
            due.late ? "text-[var(--seal)]" : "text-[var(--ink-faint)]"
          }`}
        >
          {due.text}
        </span>
      ) : null}
      {onRemove ? <RemoveButton label={t("删除这条待办")} onClick={onRemove} /> : null}
    </div>
  );
}

export function TodoColumn({
  buckets,
  today,
  docs,
  onToggle,
  onAdd,
  onRemove,
  onOpenDoc,
}: {
  buckets: TodoBuckets;
  today: string;
  /** 文库还没载完时为 null：此时找不到清单那篇，提交会误建一篇新的，先锁住输入 */
  docs: DocMeta[] | null;
  onToggle: (item: TodoItem, checked: boolean) => Promise<boolean>;
  onAdd: (text: string, target: AddTarget) => Promise<boolean>;
  onRemove: (item: TodoItem) => Promise<boolean>;
  onOpenDoc: (id: string) => void;
}) {
  /**
   * 这次在页面上勾掉的：勾完那条就不再属于任何「要做」桶了，直接消失会让人以为没点上，
   * 也没法撤回。先留在原地画成已完成，离开页面再清。
   */
  const [justDone, setJustDone] = useState<Map<string, TodoItem>>(() => new Map());
  /** 点了删除的：先从界面拿掉，写回失败再放回来 */
  const [removed, setRemoved] = useState<Map<string, TodoItem>>(() => new Map());
  const t = useT();

  /**
   * key 里带行号，删掉一行后同一篇下面的待办行号全会前移，旧 key 会落到别的条目头上；
   * 所以按 key 认的同时还要文字一致，才算「同一条」。
   */
  const sameIn = (map: Map<string, TodoItem>, item: TodoItem) => map.get(item.key)?.text === item.text;

  const active = [...buckets.overdue, ...buckets.today, ...buckets.undated];
  const doneOnly = [...justDone.values()].filter((i) => !active.some((a) => a.key === i.key && a.text === i.text));
  const rows = [...active, ...doneOnly].filter((i) => !sameIn(removed, i));

  const setDone = (item: TodoItem, on: boolean) =>
    setJustDone((prev) => {
      const next = new Map(prev);
      if (on) next.set(item.key, item);
      else next.delete(item.key);
      return next;
    });

  const toggle = async (item: TodoItem, checked: boolean) => {
    setDone(item, checked); // 先画上，写回失败再撤，勾选要即时
    const ok = await onToggle(item, checked);
    if (!ok) setDone(item, !checked);
  };

  const setGone = (item: TodoItem, on: boolean) =>
    setRemoved((prev) => {
      const next = new Map(prev);
      if (on) next.set(item.key, item);
      else next.delete(item.key);
      return next;
    });

  /**
   * 删除不弹确认：删的只是正文里的一行，代价小。成功后也不急着清掉这条标记——
   * 编辑器正开着那篇时，改动先进 store、要等自动保存才落盘，期间汇总读到的还是旧正文，
   * 清早了那条会闪回来；靠「key + 文字」认条目，留着也不会误伤别的行。
   */
  const remove = async (item: TodoItem) => {
    setGone(item, true);
    const ok = await onRemove(item);
    if (!ok) setGone(item, false);
  };

  return (
    <div className="min-w-0">
      <ColumnHead title={t("要做")} />
      <QuickAdd disabled={docs === null} docs={docs ?? []} onSubmit={onAdd} />
      {rows.length === 0 ? (
        <EmptyLine>{t("今天没有要做的事")}</EmptyLine>
      ) : (
        <div className="divide-y divide-[var(--hairline-soft)]">
          {rows.map((item) => {
            const done = sameIn(justDone, item);
            // 发布排期勾上就写进了 published: true，没有「取消发布」这回事
            const locked = done && item.source === "publish";
            return (
              <TodoRow
                // 刚勾掉的可能和行号前移后的另一条撞 key，带上文字才唯一
                key={`${item.key}|${item.text}`}
                item={item}
                done={done}
                today={today}
                onToggle={locked ? undefined : () => void toggle(item, !done)}
                onOpen={() => onOpenDoc(item.docId)}
                onRemove={item.source === "publish" ? undefined : () => void remove(item)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 过去 / 将来某天的左栏：那天在今天页勾掉的事；不能取消勾选，但可以把记录删掉 */
export function DoneColumn({ events, onRemove }: { events: DayEvent[]; onRemove: (e: DayEvent) => void }) {
  const tasks = events.filter((e) => e.kind === "task").sort((a, b) => a.ts - b.ts);
  const t = useT();
  return (
    <div className="min-w-0">
      <ColumnHead title={t("那天完成")} />
      {tasks.length === 0 ? (
        <EmptyLine>{t("那天没有完成记录")}</EmptyLine>
      ) : (
        <div className="divide-y divide-[var(--hairline-soft)]">
          {tasks.map((e, i) => (
            <div key={`${e.ts}-${i}`} className="group flex items-start gap-2.5 px-0.5 py-2">
              <TodoBox done />
              <div className="min-w-0 flex-1 text-[14.5px] leading-[1.45] text-[var(--ink-faint)] line-through decoration-[var(--hairline-strong)]">
                {e.text}
              </div>
              <RemoveButton label={t("删除这条记录")} onClick={() => onRemove(e)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
