"use client";

// 阅读模式的外围件：顶栏右侧的字数/时长/主题名，以及正文卡片顶部的标题。
// 只在 Preview 的 reading 变体里出现，拆出来是为了不让 Preview 再背一份 store 依赖。

import { useMemo } from "react";
import { wordCount } from "@/lib/wordCount";
import { useStore } from "@/store/useStore";

/** 顶栏右侧：字数 · 预计阅读时长 · 当前排版主题 */
export function ReadingMeta({ themeName }: { themeName: string }) {
  const content = useStore((s) => s.content);
  // wordCount 内部要过几遍正则，只在正文变化时重扫
  const chars = useMemo(() => wordCount(content), [content]);

  return (
    <span className="flex items-center gap-2 text-[12px] text-[var(--ink-faint)]">
      <span>{chars} 字</span>
      {chars > 0 ? <span>· 约 {Math.max(1, Math.ceil(chars / 400))} 分钟读完</span> : null}
      <span className="max-w-[180px] truncate text-[var(--ink-soft)]">· {themeName}</span>
    </span>
  );
}

/** 正文卡片顶部的文章标题（正文本体由排版主题渲染，标题不属于 Markdown 正文） */
export function ReadingTitle() {
  const title = useStore((s) => s.title);

  return (
    <div className="px-4">
      <h1 className="text-[26px] font-bold leading-[1.4] text-[#1a1a1a] [font-family:var(--serif)]">
        {title}
      </h1>
      <div className="mt-3 h-px w-10 bg-[#e5e5e5]" />
    </div>
  );
}
