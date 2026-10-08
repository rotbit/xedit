"use client";

/**
 * 「要做」一栏：快速输入 + 逾期 / 今天 / 清单里没定日期的待办，其余折叠成一行。
 * 过去某天换成 DoneColumn：只读列出那天在今天页勾掉的事。
 */
import { useState } from "react";
import { formatDue } from "@/lib/todos/dates";
import type { TodoBuckets, TodoItem } from "@/lib/todos/collect";
import type { DayEvent } from "@/lib/todos/events";
import { ColumnHead, EmptyLine, TodoBox } from "./parts";

function secondaryOf(item: TodoItem): string | null {
  if (item.source === "doc") return `文章里的待办 · 《${item.docTitle}》`;
  if (item.source === "publish") return "已排期";
  return null; // 待办清单里的就是「自己记的事」，不必再注明出处
}

/** 右侧日期列：今天到期的不标（整页都是今天，再写一遍「今天」是噪音） */
function dueLabel(item: TodoItem, today: string): { text: string; late: boolean } | null {
  if (!item.due || item.due === today) return null;
  const text = formatDue(item.due, today);
  return item.due < today ? { text: `${text} 逾期`, late: true } : { text, late: false };
}

function TodoRow({
  item,
  done,
  today,
  onToggle,
  onOpen,
}: {
  item: TodoItem;
  done: boolean;
  today: string;
  onToggle: (() => void) | undefined;
  onOpen: () => void;
}) {
  const due = done ? null : dueLabel(item, today);
  const sub = secondaryOf(item);
  return (
    <div className="group flex items-start gap-2.5 px-0.5 py-2">
      <TodoBox done={done} onClick={onToggle} label={done ? "取消完成" : "标记完成"} />
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
    </div>
  );
}

/** 快速输入：回车追加到待办清单；输入法组字时的回车是选词，不能当提交 */
function QuickAdd({ disabled, onAdd }: { disabled: boolean; onAdd: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (!text.trim() || pending) return;
    // 提交中锁住输入：清单那篇还没建好时连敲两次回车会建出两篇「待办清单」
    setPending(true);
    const ok = await onAdd(text);
    setPending(false);
    if (ok) setText("");
  };
  return (
    <div className="mb-1.5 flex items-center gap-2.5 border-b border-[var(--hairline-soft)] px-0.5 py-2">
      <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-dashed border-[var(--hairline-strong)]" />
      <input
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--ink-faint)] disabled:opacity-60"
        placeholder="记一件事…"
        value={text}
        disabled={disabled || pending}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          void submit();
        }}
      />
    </div>
  );
}

export function TodoColumn({
  buckets,
  today,
  docsReady,
  onToggle,
  onAdd,
  onOpenDoc,
}: {
  buckets: TodoBuckets;
  today: string;
  /** 文库还没载完：此时找不到清单那篇，提交会误建一篇新的，先锁住输入 */
  docsReady: boolean;
  onToggle: (item: TodoItem, checked: boolean) => Promise<boolean>;
  onAdd: (text: string) => Promise<boolean>;
  onOpenDoc: (id: string) => void;
}) {
  const [showLater, setShowLater] = useState(false);
  /**
   * 这次在页面上勾掉的：勾完那条就不再属于任何「要做」桶了，直接消失会让人以为没点上，
   * 也没法撤回。先留在原地画成已完成，离开页面再清。
   */
  const [justDone, setJustDone] = useState<Map<string, TodoItem>>(() => new Map());

  const active = [...buckets.overdue, ...buckets.today, ...buckets.undated];
  const later = showLater ? buckets.later : [];
  const shownKeys = new Set([...active, ...later].map((i) => i.key));
  const doneOnly = [...justDone.values()].filter((i) => !shownKeys.has(i.key));
  const rows = [...active, ...later, ...doneOnly];

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

  return (
    <div className="min-w-0">
      <ColumnHead title="要做" />
      <QuickAdd disabled={!docsReady} onAdd={onAdd} />
      {rows.length === 0 ? (
        <EmptyLine>今天没有要做的事</EmptyLine>
      ) : (
        <div className="divide-y divide-[var(--hairline-soft)]">
          {rows.map((item) => {
            const done = justDone.has(item.key);
            // 发布排期勾上就写进了 published: true，没有「取消发布」这回事
            const locked = done && item.source === "publish";
            return (
              <TodoRow
                key={item.key}
                item={item}
                done={done}
                today={today}
                onToggle={locked ? undefined : () => void toggle(item, !done)}
                onOpen={() => onOpenDoc(item.docId)}
              />
            );
          })}
        </div>
      )}
      {buckets.later.length > 0 ? (
        <div className="mt-3.5 text-[13px] text-[var(--ink-faint)]">
          {showLater ? null : `另有 ${buckets.later.length} 件没定日期或在以后 · `}
          <button
            type="button"
            className="cursor-pointer text-[var(--ink-soft)] hover:text-[var(--ink)]"
            onClick={() => setShowLater((v) => !v)}
          >
            {showLater ? "收起" : "展开"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** 过去 / 将来某天的左栏：那天在今天页勾掉的事，只读 */
export function DoneColumn({ events }: { events: DayEvent[] }) {
  const tasks = events.filter((e) => e.kind === "task").sort((a, b) => a.ts - b.ts);
  return (
    <div className="min-w-0">
      <ColumnHead title="那天完成" />
      {tasks.length === 0 ? (
        <EmptyLine>那天没有完成记录</EmptyLine>
      ) : (
        <div className="divide-y divide-[var(--hairline-soft)]">
          {tasks.map((e, i) => (
            <div key={`${e.ts}-${i}`} className="flex items-start gap-2.5 px-0.5 py-2">
              <TodoBox done />
              <div className="min-w-0 flex-1 text-[14.5px] leading-[1.45] text-[var(--ink-faint)] line-through decoration-[var(--hairline-strong)]">
                {e.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
