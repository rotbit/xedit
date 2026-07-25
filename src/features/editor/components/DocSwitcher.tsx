"use client";

import { useRouter } from "next/navigation";
import { ChevronsUpDown, FileText, Check } from "lucide-react";
import { Dropdown, menuItemCls } from "@/components/Dropdown";
import type { DocOption } from "../hooks/useDocOptions";

/** 切换文章：最近列表，小改多篇时免回工作台 */
export function DocSwitcher({ docId, docList }: { docId: string; docList: DocOption[] }) {
  const router = useRouter();

  return (
    <Dropdown
      width={260}
      align="left"
      trigger={
        <button
          className="flex h-8 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
          title="切换文章"
        >
          <ChevronsUpDown size={13} />
        </button>
      }
    >
      <p className="px-3.5 pb-1 pt-0.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
        最近文章
      </p>
      {docList.slice(0, 10).map((d) => (
        <button
          key={d.id}
          className={menuItemCls}
          onClick={() => {
            if (d.id !== docId) router.push(`/edit/${d.id}`);
          }}
        >
          <FileText size={13} className="shrink-0 text-[var(--ink-faint)]" />
          <span className="min-w-0 flex-1 truncate text-left">{d.title || "未命名文章"}</span>
          {d.id === docId ? <Check size={13} className="shrink-0 text-[var(--accent)]" /> : null}
        </button>
      ))}
    </Dropdown>
  );
}
