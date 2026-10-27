"use client";

/**
 * The "Today" page (home when the app opens): the left column has today (overdue + today, including undated list items) and done items;
 * the right column has the next six days, anything later, and recently opened docs.
 * All data is client-side: todos are computed from library bodies (collectTodos has its own cache).
 * No useMemo: the aggregation is cached, and recomputes are triggered by two global events besides the library, which would be awkward as memo deps.
 */
import { useState } from "react";
import { toast } from "@/components/Toast";
import { useT } from "@/i18n/useT";
import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";
import { isTemplateCategory } from "@/lib/templates";
import { collectTodos, type TodoItem } from "@/lib/todos/collect";
import { splitRepeatTag } from "@/lib/todos/dates";
import { removeDayEvent, type DayEvent } from "@/lib/todos/events";
import type { DueRange } from "@/lib/todos/parse";
import {
  addNoteTask,
  deleteTask,
  reorderTask,
  setTaskChecked,
  setTaskDue,
  setTaskLink,
  setTaskRepeat,
} from "@/lib/todos/write";
import type { Workspace } from "../../hooks/useWorkspace";
import { HISTORY } from "../../constants";
import { allCategories } from "../../lib/catTree";
import { rowId, type RowActions } from "./parts";
import type { AddTarget } from "./AddTarget";
import { doneThisWeek, doneToday } from "./doneToday";
import { TodayMain } from "./TodayMain";
import { UpcomingColumn } from "./UpcomingColumn";
import { TodoDragProvider } from "./useTodoDrag";
import { useTodoOptimism } from "./useTodoOptimism";
import { useTodaySignals } from "./useTodaySignals";

export function TodayView({ ws }: { ws: Workspace }) {
  const { library, nav, docActions } = ws;
  const t = useT();
  // Aggregation and write-back see the whole library (including the hidden todo-list doc); the picker's candidates are only user-visible docs
  const { docs, allDocs } = library;
  const { today } = useTodaySignals();
  const [menuId, setMenuId] = useState<string | null>(null);

  /** Write-back failures (storage full) only show a toast, no throw: useTodoOptimism rolls back the UI from the return value */
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
   * Record a task: always into the todo-list doc. Line building is centralized here, in the fixed order `text [[docId]] @date` —
   * the date tag is only recognized at the end of the line, so the link marker goes before it. If the target is "New", silently create that doc first
   * (in the chosen folder, using the task text if no title was given), then link it.
   * If the user typed `@每天`, it's a daily task: keep its tag and don't add a date (ignore the day picked in the right column too);
   * the link marker still goes before the tag, giving `text [[docId]] @每天`.
   */
  const add = async (text: string, target: AddTarget, due: string): Promise<boolean> => {
    try {
      const rep = splitRepeatTag(text);
      const body = rep ? rep.text : text.trim();
      const link =
        target.kind === "new"
          ? await docActions.createDocQuietly(target.title || body, "", undefined, target.category)
          : target.link;
      const line = [body, link ? `[[${link}]]` : "", `@${rep ? rep.tag : due}`].filter(Boolean).join(" ");
      await addNoteTask(line, allDocs ?? [], docActions.createDocQuietly);
      return true;
    } catch {
      // Local storage full or cloud doc creation failed both end up here; keep the panel open and the text, for an easy retry
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

  const move = async (item: TodoItem, range: DueRange | null): Promise<boolean> => {
    try {
      await setTaskDue(item, range);
      return true;
    } catch {
      toast(t("没移成：浏览器存储空间不足"), "error");
      return false;
    }
  };

  /** Same as link: writing the library swaps references and triggers a recompute, so no optimistic update needed */
  const repeat = async (item: TodoItem, on: boolean): Promise<void> => {
    try {
      await setTaskRepeat(item, on);
    } catch {
      toast(t("保存失败：浏览器存储空间不足"), "error");
    }
  };

  /** Writing the library swaps references and triggers a recompute, so no optimistic update needed */
  const link = async (item: TodoItem, id: string | null): Promise<void> => {
    try {
      await setTaskLink(item, id);
    } catch {
      toast(t("没关联上：浏览器存储空间不足"), "error");
    }
  };

  /** Line order in the checklist is the list order, so rewriting the doc is enough: the recompute after the write shows the new order */
  const reorder = async (item: TodoItem, target: TodoItem, place: "before" | "after"): Promise<void> => {
    try {
      await reorderTask(item, target, place);
    } catch {
      toast(t("保存失败：浏览器存储空间不足"), "error");
    }
  };

  const linkNew = async (item: TodoItem, title: string, category: string): Promise<void> => {
    let id: string;
    try {
      id = await docActions.createDocQuietly(title, "", undefined, category);
    } catch {
      toast(t("没记上：存储空间不足或网络异常，稍后再试"), "error");
      return;
    }
    await link(item, id);
  };

  // Folders a "New document" can go into: template categories don't take real drafts; with an empty library keep at least 「未分类」 so the dialog has an option
  const cats = allCategories(library.customCats, library.docs).filter((c) => !isTemplateCategory(c));
  const categories = cats.length > 0 ? cats : [UNCATEGORIZED];

  const titles = new Map((docs ?? []).map((d) => [d.id, d.title || t(UNTITLED_DOC)]));

  const all = collectTodos(allDocs ?? [], today);
  const opt = useTodoOptimism(all, today, { toggle, remove, move });
  const { buckets } = opt;
  const rows = [...buckets.overdue, ...buckets.today, ...opt.doneOnly];
  // Rows that can be dragged up / down: open checklist items of the today bucket (see RowActions.reorderable). Keyed by rowId so optimistic copies still match
  const reorderIds = new Set(
    buckets.today.filter((i) => i.source === "notes" && !i.checked && !opt.isDone(i)).map(rowId)
  );
  // Log changes trigger re-renders via useTodaySignals, so reading fresh on every render is fine
  const done = doneToday(today, rows);
  const week = doneThisWeek(today, rows);
  // The right column shows dated items from `later`. The page is only fully empty when both sides are empty and nothing was done today or this week —
  // when there's a review to show, switching the left column to the illustrated onboarding would make the review look out of place
  const allEmpty =
    rows.length === 0 && done.length === 0 && week.length === 0 && !buckets.later.some((i) => i.due !== null);

  /**
   * Clicking the check in "Done" to mark it undone: the record only stores doc + text, so use those to find the todo
   * (checked in the doc, or just checked and not yet saved, living only in optimistic state) and change the line back to `[ ]`;
   * the record is deleted first so the row leaves "Done" immediately. If not found (the line was deleted from the doc), just delete the record
   */
  const undo = (e: DayEvent) => {
    removeDayEvent(today, e.id);
    const item = all.find((i) => i.docId === e.docId && i.text === e.text && (i.checked || opt.isDone(i)));
    if (item) void opt.toggle(item, false);
  };

  const actions: RowActions = {
    onOpenDoc: nav.openDoc,
    onMove: (item, range) => void opt.move(item, range),
    onRepeat: (item, on) => void repeat(item, on),
    onRemove: (item) => void opt.remove(item),
    onLink: (item, id) => void link(item, id),
    onLinkNew: (item, title, category) => void linkNew(item, title, category),
    reorderable: (item) => reorderIds.has(rowId(item)),
    onReorder: (item, target, place) => void reorder(item, target, place),
    categories,
    docTitleOf: (id) => titles.get(id) ?? null,
    menuId,
    setMenuId,
  };

  // The left-column input is for "today": new items get today's date tag, so they become overdue after today instead of quietly disappearing
  const addToday = (text: string, target: AddTarget) => add(text, target, today);
  // Add to a specific day: write into the todo-list doc with an absolute date tag (parseDueTag accepts @YYYY-MM-DD); linking works as in the left column
  const addOnDay = (text: string, day: string, target: AddTarget) => add(text, target, day);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Drag a todo to change its date: drag sources and drop targets span both columns, so the state is provided here */}
      <TodoDragProvider actions={actions}>
        <div className="mx-auto grid w-full max-w-[880px] gap-10 px-6 pb-16 pt-9 sm:px-10 md:grid-cols-[minmax(0,1fr)_300px] md:gap-12">
          <TodayMain
            today={today}
            rows={rows}
            done={done}
            week={week}
            isDone={opt.isDone}
            docs={docs ?? []}
            allEmpty={allEmpty}
            ready={allDocs !== null}
            actions={actions}
            onToggle={(item, checked) => void opt.toggle(item, checked)}
            onUndo={undo}
            onAdd={addToday}
            onOpenHistory={() => nav.openCategory(HISTORY)}
            onOpenDaily={() => void docActions.openDailyNote()}
          />
          <UpcomingColumn
            today={today}
            later={buckets.later}
            ready={allDocs !== null}
            actions={actions}
            docs={docs ?? []}
            onAddOnDay={addOnDay}
            nav={nav}
          />
        </div>
      </TodoDragProvider>
    </div>
  );
}
