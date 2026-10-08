"use client";

/**
 * 「今天」页：日期标题 + 左「要做」右「做了」。
 * 数据全在客户端：待办从文库正文现算（collectTodos 自带缓存），记录读当日本地日志。
 * 不用 useMemo：算的东西都有缓存或只是读一个 localStorage 键，
 * 而触发重算的除了 docs 还有两个全局事件，挂在 memo 依赖里反而绕。
 */
import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { DOCS_CHANGED_EVENT } from "@/lib/localDocs";
import { bucketTodos, collectTodos, type TodoItem } from "@/lib/todos/collect";
import { formatDayTitle, relativeDayLabel, shiftDay, todayKey } from "@/lib/todos/dates";
import { DAY_LOG_CHANGED_EVENT, readDayEvents, removeDayEvent, type DayEvent } from "@/lib/todos/events";
import { addNoteTask, addTaskToDoc, createDocWithTask, deleteTask, setTaskChecked } from "@/lib/todos/write";
import type { Workspace } from "../../hooks/useWorkspace";
import { DayLog } from "./DayLog";
import type { AddTarget } from "./QuickAdd";
import { DoneColumn, TodoColumn } from "./TodoColumn";

const navBtnCls =
  "cursor-pointer rounded-md px-2 py-0.5 text-[12.5px] text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]";

/**
 * 订阅「文库变了 / 日志变了」两个事件，返回一个递增的版本号逼组件重渲染；
 * 顺带把「今天」重取一次——页面开过零点后，下一次任何动静都会把日期纠正过来。
 */
function useTodaySignals(): string {
  const [today, setToday] = useState(() => todayKey());
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => {
      setTick((t) => t + 1);
      setToday(todayKey());
    };
    window.addEventListener(DOCS_CHANGED_EVENT, bump);
    window.addEventListener(DAY_LOG_CHANGED_EVENT, bump);
    // 切回标签页时也对一次：隔夜挂着的页面回来就该是新的一天
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.removeEventListener(DOCS_CHANGED_EVENT, bump);
      window.removeEventListener(DAY_LOG_CHANGED_EVENT, bump);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);
  return today;
}

export function TodayView({ ws }: { ws: Workspace }) {
  const { library, nav, docActions } = ws;
  const docs = library.docs;
  const today = useTodaySignals();
  const [dayKey, setDayKey] = useState(today);
  // 跨过零点时，原本停在「今天」的人应该跟着到新的一天，而不是被留在「昨天」
  const [seenToday, setSeenToday] = useState(today);
  if (today !== seenToday) {
    setSeenToday(today);
    if (dayKey === seenToday) setDayKey(today);
  }

  const isToday = dayKey === today;
  const title = formatDayTitle(dayKey);
  const subtitle = isToday ? title.sub : (relativeDayLabel(dayKey, today) ?? title.sub);
  const events = readDayEvents(dayKey);
  const buckets = isToday ? bucketTodos(collectTodos(docs ?? [], today), today) : null;

  /** 写回失败（存储写满）只提示不抛：勾选框由调用方据返回值回滚 */
  const toggle = async (item: TodoItem, checked: boolean): Promise<boolean> => {
    try {
      await setTaskChecked(item, checked);
      return true;
    } catch {
      toast("保存失败：浏览器存储空间不足", "error");
      return false;
    }
  };

  const add = async (text: string, target: AddTarget): Promise<boolean> => {
    try {
      if (target.kind === "notes") await addNoteTask(text, docs ?? [], docActions.createDocQuietly);
      else if (target.kind === "doc") await addTaskToDoc(target.id, text);
      else await createDocWithTask(target.title, text, docActions.createDocQuietly);
      return true;
    } catch {
      // 本地写满或云端建稿失败都落到这里；面板不关、字不清，方便重试
      toast("没记上：存储空间不足或网络异常，稍后再试", "error");
      return false;
    }
  };

  /** 同 toggle：失败只提示，由调用方把那一行放回来 */
  const remove = async (item: TodoItem): Promise<boolean> => {
    try {
      await deleteTask(item);
      return true;
    } catch {
      toast("删除失败：浏览器存储空间不足", "error");
      return false;
    }
  };

  // 日志删条目只会让存储变小，不会写满失败；删完 removeDayEvent 自己派发事件触发重渲染
  const removeEvent = (e: DayEvent) => removeDayEvent(dayKey, e.ts, e.kind);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[960px] px-6 pb-16 pt-9 sm:px-10">
        <div className="flex items-center gap-3">
          <h1 className="min-w-0 flex-1 text-[22px] font-semibold leading-[1.15] tracking-tight sm:text-[26px]">
            {title.main}
            <small className="ml-2.5 text-[14px] font-normal tracking-normal text-[var(--ink-faint)]">
              {subtitle}
            </small>
          </h1>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" className={navBtnCls} onClick={() => setDayKey((k) => shiftDay(k, -1))}>
              ‹ 昨天
            </button>
            <button type="button" className={navBtnCls} onClick={() => setDayKey((k) => shiftDay(k, 1))}>
              明天 ›
            </button>
          </div>
        </div>

        <div className="mt-9 grid gap-8 md:grid-cols-2 md:gap-14">
          {buckets ? (
            <TodoColumn
              buckets={buckets}
              today={today}
              docs={docs}
              onToggle={toggle}
              onAdd={add}
              onRemove={remove}
              onOpenDoc={nav.openDoc}
            />
          ) : (
            <DoneColumn events={events} onRemove={removeEvent} />
          )}
          <DayLog events={events} isToday={isToday} onRemove={removeEvent} />
        </div>
      </div>
    </div>
  );
}
