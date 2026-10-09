"use client";

/**
 * 「今天」页：左栏今天（逾期 + 今天，含清单里没定日期的），右栏接下来六天与再往后的。
 * 数据全在客户端：待办从文库正文现算（collectTodos 自带缓存）。
 * 不用 useMemo：汇总有缓存，而触发重算的除了文库还有两个全局事件，挂在 memo 依赖里反而绕。
 */
import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { useT } from "@/i18n/useT";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { DOCS_CHANGED_EVENT } from "@/lib/localDocs";
import { collectTodos, type TodoItem } from "@/lib/todos/collect";
import { todayKey } from "@/lib/todos/dates";
import { DAY_LOG_CHANGED_EVENT } from "@/lib/todos/events";
import { addNoteTask, deleteTask, setTaskChecked, setTaskDue, setTaskLink } from "@/lib/todos/write";
import type { Workspace } from "../../hooks/useWorkspace";
import type { RowActions } from "./parts";
import { doneToday } from "./doneToday";
import type { AddTarget } from "./QuickAdd";
import { TodayMain } from "./TodayMain";
import { UpcomingColumn } from "./UpcomingColumn";
import { useTodoOptimism } from "./useTodoOptimism";

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
  const t = useT();
  // 待办汇总与写回看全库（含隐藏的待办清单那篇）；选择器的候选池只给用户看得见的文章
  const { docs, allDocs } = library;
  const today = useTodaySignals();
  const [menuId, setMenuId] = useState<string | null>(null);

  /** 写回失败（存储写满）只提示不抛：界面由 useTodoOptimism 据返回值回滚 */
  const toggle = async (item: TodoItem, checked: boolean): Promise<boolean> => {
    try {
      await setTaskChecked(item, checked);
      return true;
    } catch {
      toast(t("保存失败：浏览器存储空间不足"), "error");
      return false;
    }
  };

  /**
   * 记一件事：一律记进待办清单那篇。行的拼法集中在这里，顺序固定为 `文字 [[docId]] @日期`——
   * 日期标签只认行尾，关联标记要在它前面。目标是「新建《…》」就先静默建好那篇，再关联上。
   */
  const add = async (text: string, target: AddTarget, due: string): Promise<boolean> => {
    try {
      const link = target.kind === "new" ? await docActions.createDocQuietly(target.title, "") : target.link;
      const line = `${text.trim()}${link ? ` [[${link}]]` : ""} @${due}`;
      await addNoteTask(line, allDocs ?? [], docActions.createDocQuietly);
      return true;
    } catch {
      // 本地写满或云端建稿失败都落到这里；面板不关、字不清，方便重试
      toast(t("没记上：存储空间不足或网络异常，稍后再试"), "error");
      return false;
    }
  };

  const remove = async (item: TodoItem): Promise<boolean> => {
    try {
      await deleteTask(item);
      return true;
    } catch {
      toast(t("删除失败：浏览器存储空间不足"), "error");
      return false;
    }
  };

  const move = async (item: TodoItem, due: string | null): Promise<boolean> => {
    try {
      await setTaskDue(item, due);
      return true;
    } catch {
      toast(t("没移成：浏览器存储空间不足"), "error");
      return false;
    }
  };

  /** 写完文库会换引用、触发重算，不必乐观更新 */
  const link = async (item: TodoItem, id: string | null): Promise<void> => {
    try {
      await setTaskLink(item, id);
    } catch {
      toast(t("没关联上：浏览器存储空间不足"), "error");
    }
  };

  const linkNew = async (item: TodoItem, title: string): Promise<void> => {
    let id: string;
    try {
      id = await docActions.createDocQuietly(title, "");
    } catch {
      toast(t("没记上：存储空间不足或网络异常，稍后再试"), "error");
      return;
    }
    await link(item, id);
  };

  const titles = new Map((docs ?? []).map((d) => [d.id, d.title || t(UNTITLED_DOC)]));

  const opt = useTodoOptimism(collectTodos(allDocs ?? [], today), today, { toggle, remove, move });
  const { buckets } = opt;
  const rows = [...buckets.overdue, ...buckets.today, ...opt.doneOnly];
  // 日志变化由 useTodaySignals 触发重渲染，这里每次渲染现读即可
  const done = doneToday(today, rows);
  // 右栏展示的是 later 里带日期的；两边都空、今天也没做完过事才算整页全空
  const allEmpty = rows.length === 0 && done.length === 0 && !buckets.later.some((i) => i.due !== null);

  const actions: RowActions = {
    onOpenDoc: nav.openDoc,
    onMove: (item, due) => void opt.move(item, due),
    onRemove: (item) => void opt.remove(item),
    onLink: (item, id) => void link(item, id),
    onLinkNew: (item, title) => void linkNew(item, title),
    docTitleOf: (id) => titles.get(id) ?? null,
    menuId,
    setMenuId,
  };

  // 左栏的输入框是「今天」的，记下的事带上今天的日期标签，过了今天就成逾期、不会悄悄消失
  const addToday = (text: string, target: AddTarget) => add(text, target, today);
  // 往某一天记：带绝对日期标签写进待办清单那篇（parseDueTag 认 @YYYY-MM-DD）
  const addOnDay = (text: string, day: string) => add(text, { kind: "notes" }, day);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-[1000px] gap-10 px-6 pb-16 pt-9 sm:px-10 md:grid-cols-[minmax(0,1fr)_300px] md:gap-14">
        <TodayMain
          today={today}
          rows={rows}
          done={done}
          isDone={opt.isDone}
          docs={docs ?? []}
          allEmpty={allEmpty}
          ready={allDocs !== null}
          actions={actions}
          onToggle={(item, checked) => void opt.toggle(item, checked)}
          onAdd={addToday}
        />
        <UpcomingColumn
          today={today}
          later={buckets.later}
          ready={allDocs !== null}
          actions={actions}
          onAddOnDay={addOnDay}
        />
      </div>
    </div>
  );
}
