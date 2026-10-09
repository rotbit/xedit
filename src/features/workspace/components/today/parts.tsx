"use client";

/** 今天页两栏共用的小零件：条目文案、空态、圆形复选框、行尾删除按钮 */
import { Check, X } from "lucide-react";
import type { TFn } from "@/i18n/t";
import type { TodoItem } from "@/lib/todos/collect";

/**
 * 一条待办在界面上的身份：key 里带行号，删掉一行后同一篇下面的行号会前移，
 * 旧 key 会落到别的条目头上，所以带上文字才唯一（菜单开关、React key 都用它）。
 */
export const rowId = (item: TodoItem) => `${item.key}|${item.text}`;

/** 发布排期的 text 是 lib 拼好的中文（也会原样记进当日记录），显示时按语言重拼 */
export function itemLabel(item: TodoItem, t: TFn): string {
  return item.source === "publish" ? t("发布《{title}》", { title: t(item.docTitle) }) : item.text;
}

/** 日志里记的是任务原文；发布排期的原文是 lib 拼好的中文，同 itemLabel 一样按语言重拼 */
export function eventLabel(text: string, title: string | undefined, t: TFn): string {
  return title !== undefined && text === `发布《${title}》` ? t("发布《{title}》", { title: t(title) }) : text; // i18n-ignore 比对数据原文
}

/** 来源副文本；待办清单里的就是「自己记的事」，不必再注明出处 */
export function secondaryOf(item: TodoItem, t: TFn): string | null {
  if (item.source === "doc") return t("文章里的待办 · 《{title}》", { title: item.docTitle });
  if (item.source === "publish") return t("已排期");
  return null;
}

/** 两栏都要的行操作：打开出处、挪日期、删除；菜单同一时刻只开一个，开关状态由页面统一管 */
export interface RowActions {
  onOpenDoc: (id: string) => void;
  onMove: (item: TodoItem, due: string | null) => void;
  onRemove: (item: TodoItem) => void;
  /** 当前开着移日期菜单的那一行（rowId），没有为 null */
  menuId: string | null;
  setMenuId: (id: string | null) => void;
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="px-0.5 py-2 text-[13px] text-[var(--ink-faint)]">{children}</div>;
}

/**
 * 整页全空时的引导：一张单色线稿 + 一句话。线稿只提供透明度（PNG 的 alpha），
 * 颜色用 mask 从 currentColor 取，明暗主题各自跟着 --ink-faint 走，不用备两张图。
 */
export function EmptyGuide({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-start gap-5 px-0.5 pb-4 pt-10 text-[var(--ink-faint)]">
      <span
        aria-hidden
        className="block h-[124px] w-[220px] bg-current opacity-60 [mask:url(/today-empty.png)_center/contain_no-repeat] [-webkit-mask:url(/today-empty.png)_center/contain_no-repeat]"
      />
      <p className="text-[13.5px] leading-relaxed">{text}</p>
    </div>
  );
}

/**
 * 圆形复选框：勾上后墨色填满 + 反白对勾。
 * 不给 onClick 即只读（过去某天的完成记录），仍画成已勾的样子但不可点。
 */
export function TodoBox({
  done,
  onClick,
  label,
}: {
  done: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const cls = `mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
    done
      ? "border-[var(--accent)] bg-[var(--accent)]"
      : "border-[var(--hairline-strong)] bg-[var(--panel)] group-hover:border-[var(--ink-soft)]"
  }`;
  const mark = done ? (
    <Check size={10} strokeWidth={3} className="text-[var(--accent-fg)]" />
  ) : null;
  if (!onClick) return <span className={cls}>{mark}</span>;
  return (
    <button
      type="button"
      className={`${cls} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-soft)]`}
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onClick}
    >
      {mark}
    </button>
  );
}

/**
 * 行尾的删除按钮：平时透明、悬停整行（外层带 group）时才露出来，免得每行都顶着一个叉。
 * 用透明度而不是 hidden：位置一直占着，悬停时右侧日期不会被挤得跳一下；键盘聚焦时也看得见。
 */
export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="mt-[3px] shrink-0 cursor-pointer rounded text-[var(--ink-faint)] opacity-0 hover:text-[var(--seal)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--ink-soft)] group-hover:opacity-100"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <X size={13} />
    </button>
  );
}
