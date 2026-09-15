"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { DocMeta } from "../types";
import type { Workspace } from "../hooks/useWorkspace";

/**
 * Obsidian 式标签栏：同时开着的文章排在顶栏之下，点击切换、X / 中键关闭。
 * 只有开着两篇以上才出现——单篇时面包屑已经说明了「在读哪篇」，多一条横栏纯属占地方。
 */
export function TabBar({ ws }: { ws: Workspace }) {
  const { nav, library } = ws;
  const activeRef = useRef<HTMLDivElement | null>(null);

  // 标签只是 id，标题跟着文库走；回读的记忆里可能有已被删掉的 id，在这里滤掉
  const byId = new Map((library.docs ?? []).map((d) => [d.id, d]));
  const open = nav.tabs
    .map((id) => byId.get(id))
    .filter((d): d is DocMeta => d !== undefined);

  // 激活的标签滚进可视区（横向），纯 DOM 操作
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [nav.readingId]);

  if (open.length < 2) return null;

  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--hairline-soft)] bg-[var(--panel)] px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {open.map((doc) => {
        const active = doc.id === nav.readingId;
        const label = doc.title || "未命名文章";
        return (
          <div
            key={doc.id}
            ref={active ? activeRef : undefined}
            className={`group flex h-7 max-w-[200px] shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] transition-colors ${
              active
                ? "bg-[var(--accent-wash)] font-medium text-[var(--ink)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--accent-wash)]/60 hover:text-[var(--ink)]"
            }`}
            // 中键关闭：浏览器标签栏的老习惯
            onAuxClick={(e) => {
              if (e.button !== 1) return;
              e.preventDefault();
              nav.closeTab(doc.id);
            }}
          >
            <button
              className="min-w-0 flex-1 cursor-pointer truncate text-left"
              title={label}
              onClick={() => nav.activateTab(doc.id)}
            >
              {label}
            </button>
            <button
              className={`flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--ink-faint)] transition-opacity hover:bg-[var(--panel)] hover:text-[var(--ink)] ${
                active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
              title={`关闭「${label}」`}
              onClick={(e) => {
                e.stopPropagation();
                nav.closeTab(doc.id);
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
