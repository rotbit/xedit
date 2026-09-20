"use client";

// 预览的外围件：顶栏右侧的主题入口、阅读模式的字数/时长，以及正文卡片顶部的标题。
// 只在 Preview 的 reading 变体里出现，拆出来是为了不让 Preview 再背一份 store 依赖。

import { useMemo } from "react";
import { Palette } from "lucide-react";
import { Dropdown } from "@/components/Dropdown";
import { ThemePickerPanel } from "@/components/ThemePicker";
import { CHARS_PER_MINUTE, wordCount } from "@/lib/wordCount";
import { useStore } from "@/store/useStore";

/** 预览顶栏右侧的排版主题入口：主题只作用于渲染后的成品，所以入口就放在成品旁边，
 *  点开是主题列表 + 字号/行高/段距微调 */
export function ThemeTrigger({ themeName }: { themeName: string }) {
  return (
    <Dropdown
      width={430}
      trigger={
        <button
          className="flex h-7 max-w-[200px] cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
          title="切换排版主题"
        >
          <Palette size={14} className="shrink-0" />
          <span className="truncate">{themeName}</span>
        </button>
      }
    >
      <ThemePickerPanel />
    </Dropdown>
  );
}

/** 阅读模式顶栏右侧：字数 · 预计阅读时长 */
export function ReadingMeta() {
  const content = useStore((s) => s.content);
  // wordCount 内部要过几遍正则，只在正文变化时重扫
  const chars = useMemo(() => wordCount(content), [content]);

  return (
    <span className="flex items-center gap-2 text-[12px] text-[var(--ink-faint)]">
      <span>{chars} 字</span>
      {chars > 0 ? <span>· 约 {Math.max(1, Math.ceil(chars / CHARS_PER_MINUTE))} 分钟读完</span> : null}
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
