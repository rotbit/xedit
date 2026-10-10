"use client";

/**
 * 今天页底部的「最近在写」：按最后打开 / 最后编辑取较晚者倒序，列最近几篇文章。
 *
 * 为什么并进今天页：打开应用默认落在这里，「今天要做的事 + 手头在写的稿子」一屏看完，
 * 不必再去侧栏点一下「最近打开」；它也是跨文件夹时间流（ALL 视图）唯一的一键入口。
 * 为什么只列 8 篇：这里是落脚点不是列表页，多了会把待办挤下去；更多的走标题右侧「全部」进 ALL 视图。
 */
import { useMemo } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { useT } from "@/i18n/useT";
import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";
import { formatRelativeTime } from "@/lib/format";
import { ALL } from "../../constants";
import { displayCatPath } from "../../lib/catPath";
import { recencyOf, useRecentOpens } from "../../lib/recentOpens";
import type { Workspace } from "../../hooks/useWorkspace";
import type { DocMeta } from "../../types";

const LIMIT = 8;

export function RecentDocsSection({ docs, nav }: { docs: DocMeta[]; nav: Workspace["nav"] }) {
  const t = useT();
  const opens = useRecentOpens();
  // 与 ALL 视图同一排序口径；recencyOf 遇脏数据会原样返回 updatedAt，解析失败按 0 沉底
  const recent = useMemo(
    () =>
      docs
        .map((doc) => {
          const at = recencyOf(doc, opens);
          return { doc, at, ms: Date.parse(at) || 0 };
        })
        .sort((a, b) => b.ms - a.ms)
        .slice(0, LIMIT),
    [docs, opens],
  );
  if (recent.length === 0) return null;
  return (
    <div className="mt-8">
      <h2 className="flex items-center justify-between border-b border-[var(--hairline)] pb-2 text-[11.5px] tracking-[.14em] text-[var(--ink-faint)]">
        <span>{t("最近在写")}</span>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-0.5 font-normal tracking-normal hover:text-[var(--ink)]"
          onClick={() => nav.openCategory(ALL)}
        >
          {t("全部")}
          <ChevronRight size={12} />
        </button>
      </h2>
      <div className="divide-y divide-[var(--hairline-soft)]">
        {recent.map(({ doc, at }) => (
          <button
            key={doc.id}
            type="button"
            className="flex w-full cursor-pointer items-center gap-2.5 px-0.5 py-2 text-left hover:bg-[var(--paper)]"
            onClick={() => nav.openDoc(doc.id)}
          >
            <FileText size={14} className="shrink-0 text-[var(--ink-faint)]" />
            <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--ink)]">{doc.title || t(UNTITLED_DOC)}</span>
            <span className="hidden max-w-[160px] truncate text-[12px] text-[var(--ink-faint)] sm:block">
              {displayCatPath(doc.category || UNCATEGORIZED, t)}
            </span>
            <span className="shrink-0 text-[12px] tabular-nums text-[var(--ink-faint)]">{formatRelativeTime(at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
