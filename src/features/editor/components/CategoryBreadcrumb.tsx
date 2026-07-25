"use client";

import { Folder, FolderPlus, ChevronDown, Check } from "lucide-react";
import { Dropdown, menuItemCls } from "@/components/Dropdown";
import { askInput } from "@/components/PromptDialog";

/** 顶栏面包屑的分类选择器：切换当前文章分类，也可现场新建 */
export function CategoryBreadcrumb({
  category,
  catList,
  onSelect,
  onCreated,
}: {
  category: string;
  catList: string[];
  onSelect: (cat: string) => void;
  onCreated: (cat: string) => void;
}) {
  const createCategory = async () => {
    const name = (await askInput({ title: "新建分类", placeholder: "分类名称" }))
      ?.trim()
      .slice(0, 50);
    if (!name) return;
    onSelect(name);
    onCreated(name);
  };

  return (
    <Dropdown
      width={200}
      align="left"
      trigger={
        <button
          className="flex h-8 max-w-40 cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-2 text-[12.5px] text-[var(--ink-faint)] hover:border-[var(--hairline)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
          title="文章分类"
        >
          <Folder size={13} />
          <span className="truncate">{category}</span>
          <ChevronDown size={12} className="shrink-0 opacity-60" />
        </button>
      }
    >
      <p className="px-3.5 pb-1 pt-0.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
        移动到分类
      </p>
      {catList.map((c) => (
        <button key={c} className={menuItemCls} onClick={() => onSelect(c)}>
          <Folder size={13} className="shrink-0 text-[var(--ink-faint)]" />
          <span className="min-w-0 flex-1 truncate text-left">{c}</span>
          {c === category ? <Check size={13} className="shrink-0 text-[var(--accent)]" /> : null}
        </button>
      ))}
      <div className="my-1 border-t border-[var(--hairline)]" />
      <button className={menuItemCls} onClick={() => void createCategory()}>
        <FolderPlus size={13} className="text-[var(--ink-faint)]" />
        新建分类…
      </button>
    </Dropdown>
  );
}
