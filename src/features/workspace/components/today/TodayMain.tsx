"use client";

/**
 * 今天页左栏：日期标题 + 快速输入 + 逾期与今天的待办。
 * 没定日期的、明天以后的都在右栏「接下来」，这里只放今天该处理的事。
 * 列表下面是「做完了」：今天勾掉的事（当日日志），刷新后从列表消失的也还留在这里。
 */
import type { TFn } from "@/i18n/t";
import { useLocale, useT } from "@/i18n/useT";
import type { TodoItem } from "@/lib/todos/collect";
import { formatDayTitle, formatDue } from "@/lib/todos/dates";
import { removeDayEvent, type DayEvent } from "@/lib/todos/events";
import type { DocMeta } from "../../types";
import { MoveMenu } from "./MoveMenu";
import { EmptyGuide, EmptyLine, eventLabel, itemLabel, RemoveButton, rowId, secondaryOf, TodoBox, type RowActions } from "./parts";
import { QuickAdd, type AddTarget } from "./QuickAdd";

function TodoRow({
  item,
  done,
  today,
  actions,
  onToggle,
  t,
}: {
  item: TodoItem;
  done: boolean;
  today: string;
  actions: RowActions;
  onToggle: (() => void) | undefined;
  t: TFn;
}) {
  const locale = useLocale();
  const id = rowId(item);
  const menuOpen = actions.menuId === id;
  const late = !done && item.due !== null && item.due < today;
  const sub = secondaryOf(item, t);
  const label = itemLabel(item, t);
  const textCls = `text-left text-[14.5px] leading-[1.45] ${
    done ? "text-[var(--ink-faint)] line-through decoration-[var(--hairline-strong)]" : ""
  }`;
  // 待办清单里的事没有「出处」可去（那篇对用户隐形）
  const canOpen = item.source !== "notes";
  // 发布排期不是正文里的一行，没东西可删
  const canRemove = !done && item.source !== "publish";
  return (
    <div className="group relative flex items-start gap-2.5 px-0.5 py-2">
      <TodoBox done={done} onClick={onToggle} label={done ? t("取消完成") : t("标记完成")} />
      <div className="min-w-0 flex-1">
        {/* 点文字去看出处：待办常常要回到文章里才知道具体怎么做 */}
        {canOpen ? (
          <button
            type="button"
            className={`cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-soft)] ${textCls}`}
            onClick={() => actions.onOpenDoc(item.docId)}
          >
            {label}
          </button>
        ) : (
          <span className={textCls}>{label}</span>
        )}
        {sub ? <div className="mt-px truncate text-[12.5px] text-[var(--ink-faint)]">{sub}</div> : null}
      </div>
      {late && item.due ? (
        <span className="mt-[3px] shrink-0 rounded-[4px] bg-[var(--seal-wash)] px-1.5 py-px text-[11px] tabular-nums text-[var(--seal)]">
          {t("{date} 逾期", { date: formatDue(item.due, today, locale) })}
        </span>
      ) : null}
      {done ? null : (
        <button
          type="button"
          // 标成菜单触发器：外部关闭逻辑放它一马，开关由这里自己 toggle
          data-menu-trigger
          aria-expanded={menuOpen}
          className={`mt-[2px] shrink-0 cursor-pointer rounded px-1.5 py-px text-[11.5px] text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--ink-soft)] group-hover:opacity-100 ${
            menuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => actions.setMenuId(menuOpen ? null : id)}
        >
          {t("移到")} ▾
        </button>
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
  /** 「记到文章」的候选池：用户看得见的文章（不含待办清单那篇） */
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
          <EmptyGuide text={t("记一件今天要做的事，或在右侧排到某一天")} />
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
