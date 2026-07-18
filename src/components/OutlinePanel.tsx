"use client";

import { useMemo } from "react";
import { ListTree } from "lucide-react";
import { useStore } from "@/store/useStore";

interface Heading {
  level: number;
  text: string;
  line: number;
}

/** 从 Markdown 内容提取 H1-H3 大纲（跳过代码块内的 #） */
function parseOutline(content: string): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,3})\s+(.+)/.exec(line);
    if (m) {
      headings.push({
        level: m[1].length,
        text: m[2].replace(/[*_`~]/g, "").trim(),
        line: i,
      });
    }
  }
  return headings;
}

export function OutlinePanel({ onJump }: { onJump: (line: number) => void }) {
  const content = useStore((s) => s.content);
  const outline = useMemo(() => parseOutline(content), [content]);

  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-[var(--hairline)] bg-[var(--panel)]">
      <p className="flex shrink-0 items-center gap-1.5 border-b border-[var(--hairline)] px-3.5 py-2 text-[11px] tracking-widest text-[var(--ink-faint)]">
        <ListTree size={12} />
        大纲
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {outline.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-[11.5px] leading-5 text-[var(--ink-faint)]">
            使用 # 标题
            <br />
            自动生成大纲
          </p>
        ) : (
          outline.map((h, i) => (
            <button
              key={i}
              className="block w-full cursor-pointer truncate px-3.5 py-1.5 text-left text-[12.5px] leading-5 text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--accent-deep)]"
              style={{ paddingLeft: `${14 + (h.level - 1) * 14}px` }}
              title={h.text}
              onClick={() => onJump(h.line)}
            >
              {h.text}
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
