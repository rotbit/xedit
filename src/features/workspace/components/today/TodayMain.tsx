"use client";

/**
 * 今天页左栏：日期标题 + 快速输入 + 逾期与今天的待办。
 * 明天以后的都在右栏「接下来」，这里只放今天该处理的事（清单里没定日期的也算今天）。
 * 列表下面是「本周已完成」：今天勾掉的事（当日日志，刷新后从列表消失的也还留在这里）与本周往前几天按天列出的；
 * 段末一行「历史已完成」进历史页。「最近打开」在右栏 UpcomingColumn 里，不在这个组件内。
 */
import { CalendarDays, ChevronRight, FileText, Repeat } from "lucide-react";
import type { TFn } from "@/i18n/t";
import { useLocale, useT } from "@/i18n/useT";
import type { TodoItem } from "@/lib/todos/collect";
import {
  daysBetween,
  formatDayTitle,
  formatDue,
  formatMonthDay,
  formatWeekday,
  shiftDay,
} from "@/lib/todos/dates";
import { removeDayEvent, type DayEvent } from "@/lib/todos/events";
import type { DocMeta } from "../../types";
import { LinkMenu } from "./LinkMenu";
import { MoveMenu } from "./MoveMenu";
import {
  EmptyGuide,
  EmptyLine,
  eventLabel,
  itemLabel,
  linkedDoc,
  RemoveButton,
  rowId,
  secondaryOf,
  TodoBox,
  type RowActions,
} from "./parts";
import type { AddTarget } from "./AddTarget";
import { doneCountAll, writingToday } from "./doneToday";
import { QuickAdd } from "./QuickAdd";
import { dragRowCls, useTodoDrag } from "./useTodoDrag";

/** 行尾 hover 才露出来的小按钮（关联文章 / 变更日期）：标成菜单触发器，开关由按钮自己 toggle */
function MenuTrigger({ open, onClick, children }: { open: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-menu-trigger
      aria-expanded={open}
      className={`mt-[2px] shrink-0 cursor-pointer rounded px-1.5 py-px text-[11.5px] text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--ink-soft)] group-hover:opacity-100 ${
        open ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TodoRow({
  item,
  done,
  today,
  docs,
  actions,
  onToggle,
  t,
}: {
  item: TodoItem;
  done: boolean;
  today: string;
  docs: DocMeta[];
  actions: RowActions;
  onToggle: (() => void) | undefined;
  t: TFn;
}) {
  const locale = useLocale();
  const id = rowId(item);
  const menuOpen = actions.menuId === id;
  const linkId = `${id}|link`;
  const linkOpen = actions.menuId === linkId;
  const repeat = item.repeat !== null;
  // 时间段过了结束日才算逾期；逾期标签上的日期也是结束日。每日任务的 due 是现算的今天，不会逾期也不成段
  const last = item.end ?? item.due;
  const late = !repeat && !done && last !== null && last < today;
  // 进行中的时间段：注明起止和今天是第几天（逾期的照样显示逾期标签）
  const span =
    !repeat && !done && !late && item.due && item.end
      ? {
          range: `${formatMonthDay(item.due, today, locale)} – ${formatMonthDay(item.end, today, locale)}`,
          n: daysBetween(item.due, today) + 1,
        }
      : null;
  const sub = secondaryOf(item, t, actions.docTitleOf);
  const linked = linkedDoc(item, actions.docTitleOf);
  const label = itemLabel(item, t);
  const textCls = `text-left text-[14.5px] leading-[1.45] ${
    done ? "text-[var(--ink-faint)] line-through decoration-[var(--hairline-strong)]" : ""
  }`;
  // 点文字去哪：正文里的待办回那篇；清单里的事那篇对用户隐形，关联了文章才可点、去关联的那篇
  const openId = item.source === "notes" ? (linked?.id ?? null) : item.docId;
  const canLink = !done && item.source === "notes";
  // 发布排期不是正文里的一行，没东西可删
  const canRemove = !done && item.source !== "publish";
  // 做完的不可拖：它已不在任何一天的安排里
  const drag = useTodoDrag();
  return (
    <div
      {...(done ? {} : drag.dragProps(item))}
      className={`group relative flex items-start gap-2.5 px-0.5 py-2 ${done ? "" : dragRowCls(drag, item)}`}
    >
      <TodoBox done={done} onClick={onToggle} label={done ? t("取消完成") : t("标记完成")} />
      <div className="min-w-0 flex-1">
        {/* 点文字去看出处：待办常常要回到文章里才知道具体怎么做 */}
        {openId ? (
          <button
            type="button"
            className={`cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-soft)] ${textCls}`}
            onClick={() => actions.onOpenDoc(openId)}
          >
            {label}
          </button>
        ) : (
          <span className={textCls}>{label}</span>
        )}
        {sub ? (
          <div className="mt-px flex items-center gap-1 truncate text-[12.5px] text-[var(--ink-faint)]">
            {item.source === "notes" && linked ? <FileText size={12} className="shrink-0" aria-hidden /> : null}
            <span className="truncate">{sub}</span>
          </div>
        ) : null}
      </div>
      {/* 悬停操作在前、状态标签在后：操作平时透明但占位，标签放最右才能每行对齐，不被它们顶到行中间 */}
      {canLink ? (
        <MenuTrigger open={linkOpen} onClick={() => actions.setMenuId(linkOpen ? null : linkId)}>
          {t("关联文章")} ▾
        </MenuTrigger>
      ) : null}
      {done ? null : (
        <MenuTrigger open={menuOpen} onClick={() => actions.setMenuId(menuOpen ? null : id)}>
          {t("变更日期")} ▾
        </MenuTrigger>
      )}
      {canRemove ? <RemoveButton label={t("删除这条待办")} onClick={() => actions.onRemove(item)} /> : null}
      {repeat ? (
        <span className="ml-1 mt-[3px] flex shrink-0 items-center gap-1 py-px text-[11px] text-[var(--ink-faint)]">
          <Repeat size={12} className="text-[var(--ink-faint)]" aria-hidden />
          {t("每天")}
        </span>
      ) : late && last ? (
        <span className="ml-1 mt-[3px] shrink-0 rounded-[4px] bg-[var(--seal-wash)] px-1.5 py-px text-[11px] tabular-nums text-[var(--seal)]">
          {t("{date} 逾期", { date: formatDue(last, today, locale) })}
        </span>
      ) : span ? (
        <span className="ml-1 mt-[3px] shrink-0 py-px text-[11px] tabular-nums text-[var(--ink-faint)]">
          {span.range} · {t("第 {n} 天", { n: span.n, abs: span.n })}
        </span>
      ) : null}
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
      {linkOpen ? (
        <LinkMenu
          item={item}
          docs={docs}
          categories={actions.categories}
          onLink={(link) => actions.onLink(item, link)}
          onLinkNew={(title, category) => actions.onLinkNew(item, title, category)}
          onClose={() => actions.setMenuId(null)}
        />
      ) : null}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

function clock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 「做完了」里的一行：只读，不跳转；误记的可以删掉这条记录（只删日志，不动正文） */
/** 做完的一行；给了 onUndo（今天的）才能点勾取消，过去几天的只读 */
function DoneRow({ day, e, t, onUndo }: { day: string; e: DayEvent; t: TFn; onUndo?: () => void }) {
  return (
    <div className="group flex items-start gap-2.5 px-0.5 py-1.5">
      <TodoBox done onClick={onUndo} label={onUndo ? t("取消完成") : undefined} />
      <span className="min-w-0 flex-1 text-[13.5px] leading-[1.45] text-[var(--ink-faint)] line-through decoration-[var(--hairline-strong)]">
        {eventLabel(e.text ?? "", e.title, t)}
      </span>
      <span className="mt-[2px] shrink-0 text-[12px] tabular-nums text-[var(--ink-faint)]">{clock(e.ts)}</span>
      <RemoveButton label={t("删除这条记录")} onClick={() => removeDayEvent(day, e.id)} />
    </div>
  );
}

/**
 * 「本周已完成」：先是今天勾掉的事（点勾可以改回没做），再按天列本周往前几天做完的（只读）。
 * 有多少列多少，不折叠：用户要一眼看全本周做了什么。段末一行是「历史已完成」入口，去历史页看全部。
 */
function DoneSection({
  today,
  done,
  week,
  total,
  t,
  onUndo,
  onOpenHistory,
}: {
  today: string;
  done: DayEvent[];
  week: { day: string; events: DayEvent[] }[];
  /** 本地日志里全部做完过的事（doneCountAll） */
  total: number;
  t: TFn;
  onUndo: (e: DayEvent) => void;
  onOpenHistory: () => void;
}) {
  const locale = useLocale();
  if (done.length === 0 && week.length === 0 && total === 0) return null;
  const count = done.length + week.reduce((sum, g) => sum + g.events.length, 0);
  // 昨天说「昨天」更顺口；更早的用「周三 · 10/7」，星期帮人回想、日期防歧义
  const dayName = (day: string) =>
    day === shiftDay(today, -1)
      ? t("昨天")
      : `${formatWeekday(day, locale)} · ${formatMonthDay(day, today, locale)}`;
  return (
    <div className="mt-12">
      <div className="flex items-baseline justify-between border-b border-[var(--hairline)] pb-2">
        <h2 className="text-[11.5px] tracking-[.14em] text-[var(--ink-faint)]">{t("本周已完成")}</h2>
        <span className="text-[11.5px] tabular-nums text-[var(--ink-faint)]">
          {t("{n} 件", { n: count, abs: count })}
        </span>
      </div>
      {done.length > 0 ? (
        <div className="divide-y divide-[var(--hairline-soft)]">
          {done.map((e) => (
            <DoneRow key={e.id} day={today} e={e} t={t} onUndo={() => onUndo(e)} />
          ))}
        </div>
      ) : null}
      {week.map((g) => (
        <div key={g.day} className="mt-3 pb-1">
          <h3 className="border-b border-[var(--hairline-soft)] pb-1.5 text-[11px] tracking-[.14em] tabular-nums text-[var(--ink-faint)]">
            {dayName(g.day)}
          </h3>
          <div className="divide-y divide-[var(--hairline-soft)]">
            {g.events.map((e) => (
              <DoneRow key={e.id} day={g.day} e={e} t={t} />
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        className={`flex w-full cursor-pointer items-center gap-2.5 px-0.5 py-2 text-left text-[13.5px] text-[var(--ink-soft)] hover:text-[var(--ink)] ${
          done.length > 0 || week.length > 0 ? "border-t border-[var(--hairline-soft)]" : ""
        }`}
        onClick={onOpenHistory}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <CalendarDays size={14} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">{t("历史已完成")}</span>
        <span className="shrink-0 text-[12px] tabular-nums text-[var(--ink-faint)]">
          {t("{n} 件", { n: total, abs: total })}
        </span>
        <ChevronRight size={12} className="shrink-0 text-[var(--ink-faint)]" aria-hidden />
      </button>
    </div>
  );
}

export function TodayMain({
  today,
  rows,
  done,
  week,
  isDone,
  docs,
  allEmpty,
  ready,
  actions,
  onToggle,
  onUndo,
  onAdd,
  onOpenHistory,
}: {
  today: string;
  /** 逾期 + 今天 + 这次刚勾掉的 */
  rows: TodoItem[];
  /** 今天勾掉、且已不在 rows 里的事（doneToday 算好传进来） */
  done: DayEvent[];
  /** 本周（周一起）往前几天做完的事，不含今天，按天倒序（doneThisWeek 算好传进来） */
  week: { day: string; events: DayEvent[] }[];
  isDone: (item: TodoItem) => boolean;
  /** 「关联文章」的候选池：用户看得见的文章（不含待办清单那篇） */
  docs: DocMeta[];
  /** 右栏也一件没有、今天和本周也没做完过事：整页全空，左栏换成带插画的引导空态 */
  allEmpty: boolean;
  /** 全库是否载完：没载完时找不到清单那篇，提交会误建一篇新的，先锁住输入 */
  ready: boolean;
  actions: RowActions;
  onToggle: (item: TodoItem, checked: boolean) => void;
  /** 「做完了」里点勾：改回没做，回到列表 */
  onUndo: (e: DayEvent) => void;
  onAdd: (text: string, target: AddTarget) => Promise<boolean>;
  /** 「历史已完成」入口：去历史页 */
  onOpenHistory: () => void;
}) {
  const t = useT();
  // 日期格式化显式传 context 里的语言：服务端渲染时模块变量是各请求共享的，不可靠
  const locale = useLocale();
  const title = formatDayTitle(today, locale);
  // 今天写了多少放在日期下面：首页该一眼看出「今天做了什么」，比在列表底下填东西有用；
  // 日志变化由 TodayView 的信号触发重渲染，这里每次渲染现读即可
  const wrote = writingToday(today);
  // 列表区是「今天」的落点；只接右栏拖来的（开始日在今天之后），逾期 / 今天的本就在这里
  const drag = useTodoDrag();
  const listDrop = drag.dropProps(today, { accept: (i) => i.due !== null && i.due > today });
  return (
    <div className="min-w-0">
      <h1 className="text-[30px] font-semibold leading-[1.15] tracking-tight">{title.main}</h1>
      <div className="mb-6 mt-1.5 text-[13px] text-[var(--ink-faint)] tabular-nums">
        {title.sub} · {t("今天")}
        {wrote.chars > 0 ? ` · ${t("写了 {n} 字", { n: wrote.chars.toLocaleString(locale), abs: wrote.chars })}` : null}
        {wrote.docs > 0 ? ` · ${t("改了 {n} 篇", { n: wrote.docs, abs: wrote.docs })}` : null}
      </div>
      <QuickAdd disabled={!ready} docs={docs} categories={actions.categories} onSubmit={onAdd} />
      <div
        {...listDrop}
        className={`-mx-1.5 rounded-md px-1.5 ${drag.isOver(today) ? "bg-[var(--accent-wash)]" : ""}`}
      >
        {rows.length === 0 ? (
          allEmpty ? (
            <EmptyGuide text={t("添加一件今天要做的事，或在右侧排到某一天")} />
          ) : (
            <EmptyLine>{t("今天没有安排")}</EmptyLine>
          )
        ) : (
          <div className="divide-y divide-[var(--hairline-soft)]">
            {rows.map((item) => {
              const done = isDone(item);
              // 发布排期勾上就写进了 published: true，没有「取消发布」这回事
              const locked = done && item.source === "publish";
              return (
                <TodoRow
                  key={rowId(item)}
                  item={item}
                  done={done}
                  today={today}
                  docs={docs}
                  actions={actions}
                  onToggle={locked ? undefined : () => onToggle(item, !done)}
                  t={t}
                />
              );
            })}
          </div>
        )}
      </div>
      <DoneSection
        today={today}
        done={done}
        week={week}
        total={doneCountAll()}
        t={t}
        onUndo={onUndo}
        onOpenHistory={onOpenHistory}
      />
    </div>
  );
}
