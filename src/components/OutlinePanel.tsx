"use client";

// 编辑器侧的目录面板。这里从 Markdown 源码解析标题，而不像阅读/分享侧的 useOutline 那样
// 从渲染后的 DOM 里提取：编辑态左边是 textarea，右边预览可能收起或滚动在别处，没有稳定的
// 渲染 DOM 可读；而且跳转要落到「源码第几行」，只有解析源码才拿得到行号。
// 两种口径并存，不合并；缩进公式共用 useOutline 里的 outlineIndent。

import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { ChevronsLeft } from "lucide-react";
import { outlineIndent } from "@/hooks/useOutline";
import { useActiveHeading, type SubscribeTopLine } from "@/hooks/useTopLine";
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

/** 字号/字重/字族按层级分档，与颜色分开写：当前项要换色，两个 text-* 同时出现时
    谁盖谁取决于样式表里的先后而不是这里的顺序，分开就只会有一个颜色类生效 */
const LEVEL_TYPE: Record<number, string> = {
  1: "text-[13px] font-medium [font-family:var(--serif)]",
  2: "text-[12.5px]",
  3: "text-[12px]",
};
const LEVEL_INK: Record<number, string> = {
  1: "text-[var(--ink)]",
  2: "text-[var(--ink-soft)]",
  3: "text-[var(--ink-faint)]",
};

export function OutlinePanel({
  onJump,
  onClose,
  active = true,
  subscribeTopLine,
}: {
  onJump: (line: number) => void;
  /** 收起面板：收起后由正文列左上角的浮动入口接管 */
  onClose: () => void;
  /** 面板是否展开：组件常驻（w-0 动画隐藏），收起时跳过全文解析 */
  active?: boolean;
  /** 订阅编辑器视口顶端的行号，用来高亮当前章节；不传则不高亮 */
  subscribeTopLine?: SubscribeTopLine;
}) {
  const content = useStore((s) => s.content);
  // 低优先级取值：连续打字时先渲编辑器，大纲慢一拍再补
  const deferredContent = useDeferredValue(content);
  const outline = useMemo(
    () => (active ? parseOutline(deferredContent) : []),
    [deferredContent, active]
  );
  const { index: activeIndex, pin } = useActiveHeading(outline, subscribeTopLine, active);

  // 长文的目录本身也要滚：当前章节滚出面板可视区时把它带回来。
  // block:"nearest" —— 已经看得见就不动，且只滚动最近的可滚祖先（面板自己），不惊动整页
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (activeIndex < 0) return;
    itemsRef.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-[var(--hairline-soft)] bg-[var(--panel)]">
      {/* 标题行：左边标一下这是什么，右边的《收回面板，与正文列左上角的浮动入口对调 */}
      <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-3">
        <span className="pl-1 text-[11px] tracking-[0.15em] text-[var(--ink-faint)]">目录</span>
        <button
          type="button"
          title="收起目录"
          aria-label="收起目录"
          onClick={onClose}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
        >
          <ChevronsLeft size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {/* 没有标题就留白，不放引导文案 */}
        {outline.map((h, i) => (
          <button
            key={h.line}
            ref={(el) => {
              itemsRef.current[i] = el;
            }}
            // 当前项只换文字色与底色：不加左侧竖条、不加粗——加粗会让截断位置跟着抖
            className={`block w-full cursor-pointer truncate mb-[2px] rounded-md py-[5px] pr-2 text-left leading-5 transition-colors ${
              LEVEL_TYPE[h.level]
            } ${
              i === activeIndex
                ? "bg-[var(--accent-wash)] text-[var(--accent)]"
                : // 悬停的底比当前项浅一半，加上条目间 2px 的缝，两种状态挨着也分得开
                  `${LEVEL_INK[h.level]} hover:bg-[color-mix(in_srgb,var(--accent-wash)_50%,transparent)] hover:text-[var(--ink)]`
            }`}
            style={{
              paddingLeft: outlineIndent(h.level),
              // 一级标题之间空开一点，形成章节分组感
              marginTop: h.level === 1 && i > 0 ? 6 : 0,
            }}
            title={h.text}
            onClick={() => {
              pin(i);
              onJump(h.line);
            }}
          >
            {h.text}
          </button>
        ))}
      </div>
    </aside>
  );
}
