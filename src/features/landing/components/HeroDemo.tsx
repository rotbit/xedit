"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";
import { toast } from "@/components/Toast";
import { themeClass, type ThemeMeta } from "../lib/paper";

/** 未交互时自动轮换的几套主题，跨度尽量大，一眼看出差别 */
const ROTATION = ["classic", "chinese-red", "ink", "wechat-green", "magazine"];

interface Props {
  themes: ThemeMeta[];
  /** 服务端渲染好的样张正文，换主题只换外层 class */
  children: React.ReactNode;
}

/**
 * 首屏样机：左边 Markdown 源码，右边用主题的真实 CSS 渲染出的成稿。
 * 「复制到公众号」不是装饰——它跟编辑器走同一套内联逻辑，
 * 真的会把带样式的 HTML 写进剪贴板，粘到公众号后台即可验证。
 */
export function HeroDemo({ themes, children }: Props) {
  const [active, setActive] = useState(themes[0]?.id ?? "classic");
  const [pinned, setPinned] = useState(false);
  const [copied, setCopied] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pinned) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    const timer = setInterval(() => {
      i = (i + 1) % ROTATION.length;
      setActive(ROTATION[i]);
    }, 3800);
    return () => clearInterval(timer);
  }, [pinned]);

  const activeTheme = themes.find((t) => t.id === active) ?? themes[0];

  const onCopy = async () => {
    const paper = paperRef.current;
    if (!paper) return;
    try {
      // 内联器与剪贴板都只在点击时按需加载，不拖慢首屏
      const [{ inlineStyles }, { copyRichHtml }, { themeCssFor }] = await Promise.all([
        import("@/lib/copy/inline"),
        import("@/lib/copy/clipboard"),
        import("../lib/themeStyles"),
      ]);
      const clone = paper.cloneNode(true) as HTMLDivElement;
      // 样张里的标题是 div[data-h]（避免污染页面大纲），导出前搬回真标题标签，
      // 内联走的就是主题原本的 #nice h1~h6 规则，产出与编辑器里完全一致
      for (const el of Array.from(clone.querySelectorAll<HTMLElement>("[data-h]"))) {
        const heading = document.createElement(`h${el.dataset.h}`);
        heading.append(...Array.from(el.childNodes));
        el.replaceWith(heading);
      }
      clone.id = "nice";
      clone.className = "";
      inlineStyles(clone, themeCssFor(active, "#nice"));
      await copyRichHtml(clone.outerHTML, paper.innerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      toast("已复制，去公众号后台粘贴试试", "success");
    } catch {
      toast("当前浏览器不支持复制，换 Chrome 或 Safari 试试", "error");
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--hairline-strong)] bg-[var(--panel)] shadow-[0_24px_70px_-30px_rgba(0,0,0,0.45)]">
      {/* 窗口条 */}
      <div className="flex h-10 items-center gap-3 border-b border-[var(--hairline)] bg-[var(--sidebar)] px-4">
        <span className="flex shrink-0 gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#fc625d]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#fdbc40]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#35cd4b]" />
        </span>
        <span className="truncate text-[11.5px] text-[var(--ink-faint)]">
          我的第一篇推文.md
          <span className="mx-1.5">·</span>
          {activeTheme?.name}
        </span>
        <span className="flex-1" />
        <button
          onClick={onCopy}
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-deep)]"
        >
          {copied ? <Check size={13} /> : <ClipboardCopy size={13} />}
          {copied ? "已复制" : "复制到公众号"}
        </button>
      </div>

      {/* 双栏：左源码、右成稿 */}
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="hidden border-r border-[var(--hairline)] bg-[var(--panel)] px-5 py-5 text-left sm:block">
          <pre className="xe-source">
            <code>
              <span className="xe-mk"># </span>三步发一篇公众号{"\n"}
              {"\n"}
              <span className="xe-mk">## </span>为什么样式不会丢{"\n"}
              {"\n"}
              <span className="xe-mk">**</span>复制之前<span className="xe-mk">**</span>
              ，主题样式已经{"\n"}
              逐条内联到每个标签上。{"\n"}
              {"\n"}
              <span className="xe-mk">- </span>13 套排版主题，即点即换{"\n"}
              <span className="xe-mk">- </span>公式转成 SVG，公众号不变形{"\n"}
              <span className="xe-mk">- </span>图片粘贴即传图床{"\n"}
              {"\n"}
              <span className="xe-mk">&gt; </span>
              <span className="xe-dim">打开就写，不登录也能用。</span>
            </code>
          </pre>
        </div>

        <div className="bg-white p-2.5">
          <div ref={paperRef} className={themeClass(active)} style={{ padding: "4px 14px 12px" }}>
            {children}
          </div>
        </div>
      </div>

      {/* 主题轨：13 套全在这儿，点一下立刻换 */}
      <div className="border-t border-[var(--hairline)] bg-[var(--sidebar)]">
        <div className="flex items-center gap-1 overflow-x-auto px-3 py-2.5">
          <span className="mr-1 shrink-0 text-[10.5px] tracking-wider text-[var(--ink-faint)]">
            主题
          </span>
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActive(t.id);
                setPinned(true);
              }}
              aria-pressed={t.id === active}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] transition-colors ${
                t.id === active
                  ? "bg-[var(--panel)] font-medium text-[var(--ink)] shadow-[0_1px_3px_rgba(0,0,0,0.1)] ring-1 ring-[var(--hairline-strong)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: t.color }}
                aria-hidden="true"
              />
              {t.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
