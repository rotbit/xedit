"use client";

/**
 * 今天页左栏：日期标题 + 快速输入 + 逾期与今天的待办。
 * 明天以后的都在右栏「接下来」，这里只放今天该处理的事（清单里没定日期的也算今天）。
 * 列表下面是「做完了」：今天勾掉的事（当日日志），刷新后从列表消失的也还留在这里。
 */
import { FileText } from "lucide-react";
import type { TFn } from "@/i18n/t";
import { useLocale, useT } from "@/i18n/useT";
import type { TodoItem } from "@/lib/todos/collect";
import { daysBetween, formatDayTitle, formatDue, formatMonthDay } from "@/lib/todos/dates";
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
import { QuickAdd } from "./QuickAdd";

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
  // 时间段过了结束日才算逾期；逾期标签上的日期也是结束日
  const last = item.end ?? item.due;
  const late = !done && last !== null && last < today;
  // 进行中的时间段：注明起止和今天是第几天（逾期的照样显示逾期标签）
  const span =
    !done && !late && item.due && item.end
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
  return (
    <div className="group relative flex items-start gap-2.5 px-0.5 py-2">
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
      {late && last ? (
        <span className="mt-[3px] shrink-0 rounded-[4px] bg-[var(--seal-wash)] px-1.5 py-px text-[11px] tabular-nums text-[var(--seal)]">
          {t("{date} 逾期", { date: formatDue(last, today, locale) })}
        </span>
      ) : span ? (
        <span className="mt-[3px] shrink-0 py-px text-[11px] tabular-nums text-[var(--ink-faint)]">
          {span.range} · {t("第 {n} 天", { n: span.n, abs: span.n })}
        </span>
      ) : null}
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
      {menuOpen ? (
        <MoveMenu
          item={item}
          today={today}
          onMove={(due) => actions.onMove(item, due)}
          onRemove={() => actions.onRemove(item)}
          onClose={() => actions.setMenuId(null)}
        />
      ) : null}
      {linkOpen ? (
        <LinkMenu
          item={item}
          docs={docs}
          onLink={(link) => actions.onLink(item, link)}
          onLinkNew={(title) => actions.onLinkNew(item, title)}
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

/** 「做完了」：只读回顾，不跳转；误记的可以删掉这条记录（只删日志，不动正文） */
function DoneSection({ today, done, t }: { today: string; done: DayEvent[]; t: TFn }) {
  if (done.length === 0) return null;
  return (
    <div className="mt-8">
      <h2 className="border-b border-[var(--hairline)] pb-2 text-[11.5px] tracking-[.14em] text-[var(--ink-faint)]">
        {t("做完了")}
      </h2>
      <div className="divide-y divide-[var(--hairline-soft)]">
        {done.map((e) => (
          <div key={`${e.ts}|${e.docId ?? ""}|${e.text ?? ""}`} className="group flex items-start gap-2.5 px-0.5 py-2">
            <TodoBox done />
            <span className="min-w-0 flex-1 text-[14.5px] leading-[1.45] text-[var(--ink-faint)] line-through decoration-[var(--hairline-strong)]">
              {eventLabel(e.text ?? "", e.title, t)}
            </span>
            <span className="mt-[3px] shrink-0 text-[12px] tabular-nums text-[var(--ink-faint)]">{clock(e.ts)}</span>
            <RemoveButton label={t("删除这条记录")} onClick={() => removeDayEvent(today, e.ts, "task")} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TodayMain({
  today,
  rows,
  done,
  isDone,
  docs,
  allEmpty,
  ready,
  actions,
  onToggle,
  onAdd,
}: {
  today: string;
  /** 逾期 + 今天 + 这次刚勾掉的 */
  rows: TodoItem[];
  /** 今天勾掉、且已不在 rows 里的事（doneToday 算好传进来） */
  done: DayEvent[];
  isDone: (item: TodoItem) => boolean;
  /** 「关联文章」的候选池：用户看得见的文章（不含待办清单那篇） */
  docs: DocMeta[];
  /** 右栏也一件没有、今天也没做完过事：整页全空，左栏换成带插画的引导空态 */
  allEmpty: boolean;
  /** 全库是否载完：没载完时找不到清单那篇，提交会误建一篇新的，先锁住输入 */
  ready: boolean;
  actions: RowActions;
  onToggle: (item: TodoItem, checked: boolean) => void;
  onAdd: (text: string, target: AddTarget) => Promise<boolean>;
}) {
  const t = useT();
  // 日期格式化显式传 context 里的语言：服务端渲染时模块变量是各请求共享的，不可靠
  const locale = useLocale();
  const title = formatDayTitle(today, locale);
  return (
    <div className="min-w-0">
      <h1 className="text-[30px] font-semibold leading-[1.15] tracking-tight">{title.main}</h1>
      <div className="mb-6 mt-1.5 text-[13px] text-[var(--ink-faint)]">
        {title.sub} · {t("今天")}
      </div>
      <QuickAdd disabled={!ready} docs={docs} onSubmit={onAdd} />
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
      <DoneSection today={today} done={done} t={t} />
    </div>
  );
}
