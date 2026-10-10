"use client";

/**
 * 今天页底部的「最近打开」：按最后打开 / 最后编辑取较晚者倒序，列最近几篇文章。
 *
 * 为什么并进今天页：打开应用默认落在这里，「今天要做的事 + 手头在写的稿子」一屏看完，
 * 不必再去侧栏点一下「最近打开」；它也是跨文件夹时间流（ALL 视图）唯一的一键入口。
 * 为什么只列 8 篇、排成两列：这里是落脚点不是列表页，占满两栏宽排两列四行刚好用掉右栏下方的空白，
 * 页面也不会被拖得很长；更多的走标题右侧「全部」进 ALL 视图。
 * 为什么装在一块浅底的面板里：上面待办和做完了是两张带线的表，这一段换成面板形态，模块边界一眼可辨，
 * 也不会被看成第三张表；面板里不画行线、只给末级目录，
 * 完整路径前缀几乎都一样（「工作笔记/xx/2026年…」），截断后反而把有信息的末级目录截没了。
 */
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useT } from "@/i18n/useT";
import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";
import { formatRelativeTime } from "@/lib/format";
import { ALL } from "../../constants";
import { displayCatName, nameOf } from "../../lib/catPath";
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
    <section className="md:col-span-2">
      <h2 className="flex items-center justify-between pb-2.5 text-[11.5px] tracking-[.14em] text-[var(--ink-faint)]">
        <span>{t("最近打开")}</span>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-0.5 font-normal tracking-normal hover:text-[var(--ink)]"
          onClick={() => nav.openCategory(ALL)}
        >
          {t("全部")}
          <ChevronRight size={12} />
        </button>
      </h2>
      <div className="grid gap-x-6 rounded-lg border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 sm:grid-cols-2 sm:px-4">
        {recent.map(({ doc, at }) => (
          <button
            key={doc.id}
            type="button"
            className="-mx-2 flex cursor-pointer flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left hover:bg-[var(--panel)]"
            onClick={() => nav.openDoc(doc.id)}
          >
            <span className="w-full truncate text-[14px] text-[var(--ink)]">{doc.title || t(UNTITLED_DOC)}</span>
            <span className="w-full truncate text-[12px] text-[var(--ink-faint)]">
              {displayCatName(nameOf(doc.category || UNCATEGORIZED), t)} · {formatRelativeTime(at)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
