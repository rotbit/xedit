"use client";

/**
 * 今天页右栏「接下来」：明天起六天，一天一行（连续的空日子合成一行，点开再分日）；再往后的折在底部「还有 N 件」里，最下面是「最近打开」。
 * 这里只排期不打勾——要做的那天它自然会到左栏；每天末尾可以直接往那天记一件事，
 * 和左栏快速输入一样可选关联一篇文章（交互共用 AddTarget.tsx）：提前排的事常常就是某篇稿子的活。
 */
import { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import type { TFn } from "@/i18n/t";
import { useLocale, useT } from "@/i18n/useT";
import type { TodoItem } from "@/lib/todos/collect";
import { dayOfMonth, formatDue, formatMonthDay, formatWeekday, shiftDay } from "@/lib/todos/dates";
import type { Workspace } from "../../hooks/useWorkspace";
import type { DocMeta } from "../../types";
import { isDefaultTarget, Picker, TargetControl, useAddTarget, type AddTarget } from "./AddTarget";
import { MoveMenu } from "./MoveMenu";
import { RecentDocsSection } from "./RecentDocs";
import { itemLabel, linkedDoc, rowId, type RowActions } from "./parts";
import { dragRowCls, useTodoDrag } from "./useTodoDrag";

const DAYS_AHEAD = 6;

const miniBtnCls =
  "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[12px] leading-none text-[var(--ink-faint)] hover:bg-[var(--panel)] hover:text-[var(--ink)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--ink-soft)] group-hover:opacity-100";

function UpcomingItem({
  item,
  today,
  actions,
  showDate,
  t,
}: {
  item: TodoItem;
  today: string;
  actions: RowActions;
  /** 底部折叠列表里每条右侧带日期；按天排的六行里日期已经在左边了 */
  showDate: boolean;
  t: TFn;
}) {
  const locale = useLocale();
  const id = rowId(item);
  const menuOpen = actions.menuId === id;
  const label = itemLabel(item, t);
  const textCls = "min-w-0 flex-1 truncate text-left";
  // 清单里的事那篇对用户隐形，关联了文章才可点、去关联的那篇
  const openId = item.source === "notes" ? (linkedDoc(item, actions.docTitleOf)?.id ?? null) : item.docId;
  const drag = useTodoDrag();
  return (
    <div
      {...drag.dragProps(item)}
      className={`group relative -mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-[3px] text-[13px] text-[var(--ink-soft)] hover:bg-[var(--accent-wash)] ${
        menuOpen ? "bg-[var(--accent-wash)]" : ""
      } ${dragRowCls(drag, item)}`}
    >
      <span
        className={`h-[5px] w-[5px] shrink-0 rounded-full ${
          item.source === "publish" ? "bg-[var(--ink-soft)]" : "bg-[var(--hairline-strong)]"
        }`}
      />
      {openId ? (
        <button
          type="button"
          className={`${textCls} cursor-pointer hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ink-soft)]`}
          title={label}
          onClick={() => actions.onOpenDoc(openId)}
        >
          {label}
        </button>
      ) : (
        <span className={textCls} title={label}>
          {label}
        </span>
      )}
      {showDate && item.due ? (
        <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--ink-faint)]">
          {formatDue(item.due, today, locale)}
        </span>
      ) : null}
      {/* 时间段注结束日；折叠列表里紧跟在开始日后面，读作「10/9 → 10/12」 */}
      {item.end ? (
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--ink-faint)]">
          → {formatMonthDay(item.end, today, locale)}
        </span>
      ) : null}
      <button
        type="button"
        data-menu-trigger
        aria-label={t("变更日期")}
        title={t("变更日期")}
        aria-expanded={menuOpen}
        className={`${miniBtnCls} ${menuOpen ? "opacity-100" : "opacity-0"}`}
        onClick={() => actions.setMenuId(menuOpen ? null : id)}
      >
        ⋯
      </button>
      {item.source === "publish" ? null : (
        <button
          type="button"
          aria-label={t("删除")}
          title={t("删除")}
          className={`${miniBtnCls} opacity-0 hover:text-[var(--seal)]`}
          onClick={() => actions.onRemove(item)}
        >
          <X size={12} />
        </button>
      )}
      {menuOpen ? (
        <MoveMenu
          item={item}
          today={today}
          onMove={(due) => actions.onMove(item, due)}
          onRepeat={(on) => actions.onRepeat(item, on)}
          onRemove={() => actions.onRemove(item)}
          onClose={() => actions.setMenuId(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * 每天末尾的「＋ 添加到明天」：悬停那一天才露出来，回车提交后清空、焦点留着方便连记。
 * 「关联文章」只在这一行有焦点时露出，免得六行都挂着它显得吵；选好了文章标签就常驻，
 * 整行也跟着常显——不然鼠标一移开，选好的目标连同输入一起隐形了。
 */
function DayAdd({
  label,
  disabled,
  docs,
  categories,
  onSubmit,
}: {
  label: string;
  disabled: boolean;
  docs: DocMeta[];
  categories: string[];
  onSubmit: (text: string, target: AddTarget) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { target, targetLabel, picking, setPicking, choosingFolder, pick, detach, reset } = useAddTarget(
    inputRef,
    categories
  );
  const attached = !isDefaultTarget(target);
  // 文件夹弹窗开着时焦点在弹窗里、鼠标也不在这一天上，不常显的话输入行会隐形
  const shown = attached || picking || choosingFolder;
  // 选择器在面板外点击 / Esc 时关掉，焦点回到输入框。
  // 只在 picking 时挂：选了「新建」后 picking 先落下再弹文件夹窗，点弹窗、按 Esc 都碰不到这一行

  const closePicker = useCallback(() => {
    setPicking(false);
    inputRef.current?.focus();
  }, [setPicking]);
  useDismissMenu(rowRef, closePicker, picking);
  useEscape(closePicker, picking);

  return (
    <div ref={rowRef} className="group/add relative">
      <form
        className={`flex items-center gap-2 ${
          shown ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover/day:opacity-100"
        }`}
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending || !text.trim()) return;
          // 提交中锁住，防连敲回车记两遍
          setPending(true);
          const ok = await onSubmit(text.trim(), target);
          setPending(false);
          if (ok) {
            setText("");
            reset();
          }
          // 失败保留文字和目标，方便重试
          inputRef.current?.focus();
        }}
      >
        <input
          ref={inputRef}
          className="min-w-0 flex-1 bg-transparent py-[3px] text-[12px] text-[var(--ink-soft)] outline-none placeholder:text-[var(--ink-faint)] disabled:opacity-60"
          placeholder={label}
          aria-label={label}
          value={text}
          disabled={disabled || pending}
          onChange={(e) => setText(e.target.value)}
        />
        <TargetControl
          target={target}
          label={targetLabel}
          picking={picking}
          pending={disabled || pending}
          size="sm"
          className={shown ? "" : "hidden group-focus-within/add:flex"}
          onToggle={() => setPicking((v) => !v)}
          onDetach={detach}
        />
      </form>
      {picking ? <Picker docs={docs} onPick={(o) => void pick(o)} /> : null}
    </div>
  );
}

/** 底部的折叠入口：六天之后的事收成一行「还有 N 件 ›」，没有就整行不出 */
function Fold({
  items,
  today,
  actions,
  t,
}: {
  items: TodoItem[];
  today: string;
  actions: RowActions;
  t: TFn;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const n = items.length;
  return (
    <div className="border-b border-[var(--hairline-soft)]">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-1 py-2.5 text-left text-[12.5px] tabular-nums text-[var(--ink-soft)] hover:text-[var(--ink)]"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{t("还有 {n} 件", { n, abs: n })}</span>
        <span className={`inline-block text-[var(--ink-faint)] transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open ? (
        <div className="pb-2">
          {items.map((item) => (
            <UpcomingItem key={rowId(item)} item={item} today={today} actions={actions} showDate t={t} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function UpcomingColumn({
  today,
  later,
  ready,
  actions,
  docs,
  onAddOnDay,
  nav,
}: {
  today: string;
  /** later 桶：已按日期升序 */
  later: TodoItem[];
  ready: boolean;
  actions: RowActions;
  /** 关联文章的候选池：用户看得见的文章 */
  docs: DocMeta[];
  onAddOnDay: (text: string, day: string, target: AddTarget) => Promise<boolean>;
  nav: Workspace["nav"];
}) {
  const t = useT();
  const locale = useLocale();
  const last = shiftDay(today, DAYS_AHEAD);
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => shiftDay(today, i + 1));
  const byDay = new Map<string, TodoItem[]>(days.map((d) => [d, []]));
  const beyond: TodoItem[] = [];
  for (const item of later) {
    if (!item.due) continue; // later 里没日期的是文章正文里没排期的，今天页不展示
    // 时间段按开始日归到那一天，只出现一次（后面注「→ 结束日」）
    if (item.due > last) beyond.push(item);
    else byDay.get(item.due)?.push(item);
  }
  const weekCount = days.reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0);
  // 连续两天以上都没安排时合成一行「13–16 · 周二 – 周五」：空日子和有事的日子一样高会把右栏撑得很长，
  // 把下面的「最近打开」压出首屏。点任何一段就把所有合并的段一起展开成单日（用户不想一段一段点），才能往其中某一天记事；展开状态只在本次会话里
  const [expanded, setExpanded] = useState(false);
  const groups: { from: number; to: number }[] = [];
  for (let i = 0; i < days.length; i++) {
    const empty = (byDay.get(days[i])?.length ?? 0) === 0;
    let j = i;
    while (empty && j + 1 < days.length && (byDay.get(days[j + 1])?.length ?? 0) === 0) j++;
    if (j > i && !expanded) {
      groups.push({ from: i, to: j });
      i = j;
    } else groups.push({ from: i, to: i });
  }
  const dayName = (day: string, i: number) => (i === 0 ? t("明天") : formatWeekday(day, locale));
  // 拖着待办悬停的那天整行铺底色；负边距 + 同等内边距让底色盖到两侧，只在悬停时加，平时分隔线不变长
  const drag = useTodoDrag();
  const overCls = (day: string) => (drag.isOver(day) ? "-mx-2 rounded-md bg-[var(--accent-wash)] px-2" : "");

  return (
    <aside className="min-w-0">
      <div className="flex items-baseline justify-between border-b border-[var(--hairline)] pb-2">
        <h2 className="text-[11.5px] tracking-[.14em] text-[var(--ink-faint)]">{t("接下来")}</h2>
        <span className="text-[11.5px] tabular-nums text-[var(--ink-faint)]">
          {t("{n} 件", { n: weekCount, abs: weekCount })}
        </span>
      </div>
      {groups.map(({ from, to }) => {
        if (to > from) {
          const a = days[from];
          const b = days[to];
          return (
            <button
              key={a}
              type="button"
              title={t("展开这几天")}
              // 也是落点：直接松手落到第一天；拖着停一会儿自动展开，好继续拖到具体某一天
              {...drag.dropProps(a, { onLinger: () => setExpanded(true) })}
              className={`group/run grid w-full cursor-pointer grid-cols-[44px_minmax(0,1fr)] gap-2.5 border-b border-[var(--hairline-soft)] py-2.5 text-left text-[var(--hairline-strong)] hover:text-[var(--ink-faint)] ${overCls(a)}`}
              onClick={() => setExpanded(true)}
            >
              <div className="[font-family:var(--serif)] whitespace-nowrap text-[13px] leading-[18px] tabular-nums">
                {dayOfMonth(a)}–{dayOfMonth(b)}
              </div>
              <div className={`min-w-0 truncate py-[3px] text-[12px] leading-[12px] ${locale === "en" ? "" : "tracking-[.14em]"}`}>
                {dayName(a, from)} – {dayName(b, to)}
              </div>
            </button>
          );
        }
        const day = days[from];
        const items = byDay.get(day) ?? [];
        const empty = items.length === 0;
        const name = dayName(day, from);
        return (
          <div
            key={day}
            {...drag.dropProps(day)}
            className={`group/day grid grid-cols-[44px_minmax(0,1fr)] gap-2.5 border-b border-[var(--hairline-soft)] py-2.5 ${overCls(day)}`}
          >
            <div className={empty && !drag.isOver(day) ? "text-[var(--hairline-strong)]" : "text-[var(--ink)]"}>
              <div className="[font-family:var(--serif)] text-[18px] leading-none">{dayOfMonth(day)}</div>
              <div
                className={`mt-1.5 whitespace-nowrap text-[10.5px] ${locale === "en" ? "" : "tracking-[.14em]"} ${
                  empty ? "" : "text-[var(--ink-faint)]"
                }`}
              >
                {name}
              </div>
            </div>
            <div className="min-w-0">
              {empty ? <div className="py-[3px] text-[13px] text-[var(--hairline-strong)]">—</div> : null}
              {items.map((item) => (
                <UpcomingItem key={rowId(item)} item={item} today={today} actions={actions} showDate={false} t={t} />
              ))}
              <DayAdd
                label={t("＋ 添加到{day}", { day: name })}
                disabled={!ready}
                docs={docs}
                categories={actions.categories}
                onSubmit={(text, target) => onAddOnDay(text, day, target)}
              />
            </div>
          </div>
        );
      })}
      <Fold items={beyond} today={today} actions={actions} t={t} />
      <RecentDocsSection docs={docs} nav={nav} />
    </aside>
  );
}
