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
    <aside className="flex w-52 shrink-0 flex-col border-r border-[var(--hairline)] bg-[var(--panel)]">
      <p className="flex shrink-0 items-center gap-1.5 px-4 pb-2 pt-3.5 text-[11px] tracking-[0.15em] text-[var(--ink-faint)]">
        <ListTree size={12} strokeWidth={1.75} />
        大纲
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {outline.length === 0 ? (
          <p className="px-2 py-8 text-center text-[11.5px] leading-6 text-[var(--ink-faint)]">
            使用 # 标题
            <br />
            自动生成大纲
          </p>
        ) : (
          outline.map((h, i) => (
            <button
              key={i}
              className={`block w-full cursor-pointer truncate rounded-md py-[5px] pr-2 text-left leading-5 transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] ${
                h.level === 1
                  ? "text-[13px] font-medium text-[var(--ink)] [font-family:var(--serif)]"
                  : h.level === 2
                    ? "text-[12.5px] text-[var(--ink-soft)]"
                    : "text-[12px] text-[var(--ink-faint)]"
              }`}
              style={{
                paddingLeft: `${8 + (h.level - 1) * 14}px`,
                // 一级标题之间空开一点，形成章节分组感
                marginTop: h.level === 1 && i > 0 ? 6 : 0,
              }}
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
