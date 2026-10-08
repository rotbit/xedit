"use client";

/** 今天页两栏共用的小零件：栏头、空态、圆形复选框、行尾删除按钮 */
import { Check, X } from "lucide-react";

export function ColumnHead({ title }: { title: string }) {
  return (
    <div className="mb-3.5 flex items-baseline border-b border-[var(--hairline)] pb-2">
      <h2 className="text-[13px] font-semibold tracking-[0.04em] text-[var(--ink-soft)]">{title}</h2>
    </div>
  );
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="px-0.5 py-2 text-[13px] text-[var(--ink-faint)]">{children}</div>;
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
