"use client";

/**
 * 今天页的「拖动待办改日期」：把一条待办拖到右栏某一天（或拖回左栏今天的列表），松手就改到那天。
 *
 * 为什么用原生 HTML5 拖放而不引 dnd-kit 之类：这里只有「整行拖到某个日子上」一种动作，不排序、不跨容器重排，
 * 原生事件几十行就够，不值得多背一个依赖；桌面鼠标场景原生拖放体验足够。
 * 触屏上原生拖放基本不可用，那里仍走行尾的「变更日期」菜单——拖放只是多一条路，菜单一直都在。
 *
 * 状态（正在拖哪条、悬停在哪天）放在 Context 里：拖源在左右两栏的行里，落点也分散在两栏，
 * 由 TodayView 统一 Provider，行和落点只拿 dragProps / dropProps 两个小 helper 往元素上一摊。
 */
import { createContext, useContext, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { TodoItem } from "@/lib/todos/collect";
import { rowId, type RowActions } from "./parts";

/** 拖着悬停在合并的空日子那一行上多久自动展开成单日，好让用户继续拖到其中具体某一天 */
const LINGER_MS = 400;

interface DropOptions {
  /** 这个落点接不接这一条；不接就不 preventDefault，光标显示禁止、松手什么也不做 */
  accept?: (item: TodoItem) => boolean;
  /** 悬停超过 LINGER_MS 时调用（合并行用来自动展开） */
  onLinger?: () => void;
}

interface TodoDrag {
  dragProps: (item: TodoItem) => {
    draggable: boolean;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: () => void;
  };
  dropProps: (
    day: string,
    opts?: DropOptions
  ) => {
    onDragOver: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
  /** 这一行是不是正被拖着（画成半透明） */
  isDragging: (item: TodoItem) => boolean;
  /** 正拖着一条悬停在这一天的落点上（落点高亮） */
  isOver: (day: string) => boolean;
}

const Ctx = createContext<TodoDrag | null>(null);

export function TodoDragProvider({ actions, children }: { actions: RowActions; children: ReactNode }) {
  const [dragging, setDragging] = useState<TodoItem | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  // 合并行的展开计时：同一时刻只悬停在一个落点上，一个计时器就够；记下它属于哪天，dragover 连发时不重复起
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
  };

  // 拖到它当前所在那天等于没动，不当落点：光标显示禁止，松手原样弹回
  const accepts = (day: string, opts?: DropOptions) =>
    dragging !== null && day !== dragging.due && (opts?.accept?.(dragging) ?? true);

  const value: TodoDrag = {
    dragProps: (item) => ({
      draggable: true,
      onDragStart: (e) => {
        // 菜单开着时行里还有日期框等可交互的东西，从那里拖会误把整行拖走；取消这次拖动
        if (actions.menuId !== null) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        // Firefox 不 setData 不会真正开始拖
        e.dataTransfer.setData("text/plain", item.text);
        setDragging(item);
      },
      // 松在非落点上、或按 Esc 取消时只有这里收得到；落在别处后源行可能已卸载，所以 onDrop 也会清
      onDragEnd: reset,
    }),
    dropProps: (day, opts) => ({
      onDragOver: (e) => {
        // 没有拖拽中的待办（比如从桌面拖进来的文件）不拦，交给页面别处处理
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
        // 在落点内部的子元素之间移动也会触发 dragleave，真离开了才清，不然高亮一闪一闪
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        if (linger.current?.day === day) stopLinger();
        setOverDay((d) => (d === day ? null : d));
      },
      onDrop: (e) => {
        e.preventDefault();
        const item = dragging;
        if (item && accepts(day, opts)) {
          // 同菜单里点今天 / 明天的语义（MoveMenu 的 moveStart）：结束日照留，早于新开始日就丢掉
          actions.onMove(item, { due: day, end: item.end && item.end > day ? item.end : null });
        }
        reset();
      },
    }),
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

/** 行上的拖动手势样式：可拖的行显示抓手，正被拖的那行半透明 */
export function dragRowCls(drag: TodoDrag, item: TodoItem): string {
  return `cursor-grab active:cursor-grabbing ${drag.isDragging(item) ? "opacity-40" : ""}`;
}
