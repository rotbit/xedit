"use client";

import { Inbox } from "lucide-react";
import { ALL } from "../constants";

/** 首次装载时的时间流骨架：一个日期组 + 四行标题/摘要占位，形状对齐真实列表 */
export function DocListSkeleton() {
  return (
    <div className="mt-4 grid gap-1.5 pb-[22px] sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-6">
      <div className="h-8 w-10 animate-pulse rounded bg-[var(--hairline-soft)] sm:mt-3" />
      <div className="min-w-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="py-3.5">
            <div className="h-[14px] w-2/5 animate-pulse rounded bg-[var(--hairline-soft)]" />
            <div className="mt-1.5 h-[12px] w-[70%] animate-pulse rounded bg-[var(--hairline-soft)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 空态：按搜索 / 回收站 / 全部 / 某分类分别给出不同措辞 */
export function DocListEmpty({
  search,
  isTrash,
  activeCat,
}: {
  search: string;
  isTrash: boolean;
  activeCat: string;
}) {
  const message = search
    ? "没有匹配的文章"
    : isTrash
      ? "回收站是空的"
      : activeCat === ALL
        ? "还没有文章，点「新建文章」开始"
        : `「${activeCat}」还没有文章`;

  return (
    <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--hairline-strong)] py-16">
      <Inbox size={24} className="text-[var(--ink-faint)]" />
      <p className="text-[13px] text-[var(--ink-faint)]">{message}</p>
    </div>
  );
}
