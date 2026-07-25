"use client";

import { Inbox } from "lucide-react";
import { ALL } from "../constants";

/** 首次装载时的卡片骨架 */
export function DocListSkeleton() {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[140px] animate-pulse rounded-xl bg-[var(--panel)]/70 ring-1 ring-black/[0.04] dark:ring-white/10"
        />
      ))}
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
