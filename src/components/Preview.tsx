"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { AlignLeft, ChevronLeft } from "lucide-react";
import { BASE_CSS } from "@/lib/themes/base";
import { usePreviewRender } from "@/hooks/usePreviewRender";
import { useOutline } from "@/hooks/useOutline";
import { requestOpenWikiLink } from "@/lib/wikiLink";
import { OutlineNav } from "@/components/OutlineNav";
import { readLocal, writeLocal } from "@/features/workspace/lib/storage";
import { ReadingMeta, ReadingTitle, ThemeTrigger } from "@/features/editor/components/ReadingChrome";

/** 阅读模式大纲开合的记忆位（"1" 展开 / "0" 收起，缺省当展开） */
const OUTLINE_OPEN_KEY = "xedit.readingOutlineOpen";

interface Props {
  onScroll?: () => void;
  /** split：双屏右栏，手机窄栏 + 「公众号效果」顶栏；
   *  reading：阅读模式，整块编辑区换成 720px 宽栏成品，顶栏可退出 */
  variant?: "split" | "reading";
  /** 阅读模式的退出回调 */
  onExit?: () => void;
}

export const Preview = forwardRef<HTMLDivElement, Props>(function Preview(
  { onScroll, variant = "split", onExit },
  ref
) {
  const reading = variant === "reading";
  // [[双向链接]] 的点击：渲染结果是整段注入的 HTML，没有 React 节点可挂事件，
  // 只能在容器上做委托。点击后只派事件，找文章的活在应用层
  const onContentClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest?.("[data-wiki]")?.getAttribute("data-wiki");
    if (target) requestOpenWikiLink(target);
  };
  // 渲染管线（含 DOMPurify 消毒）：阅读模式不跟着击键跑，进来即渲染，不必防抖
  const { html, codeCss, themeCss, themeName, tuneCss, customCss } = usePreviewRender(
    reading ? 0 : 180
  );
  // 大纲只在阅读模式露出。hook 照样两个变体都调（React 不许条件调用），
  // 但双屏传 enabled=false，里面就不去扫 DOM 了
  const sectionRef = useRef<HTMLElement>(null);
  const { outline, jumpToHeading } = useOutline(sectionRef, html, reading);
  // 大纲开合：初值固定 true，localStorage 留到 useEffect 里回读——
  // 惰性初始化会让服务端渲的首帧与客户端不一致，直接踩 hydration
  const [outlineOpen, setOutlineOpen] = useState(true);
  useEffect(() => {
    if (readLocal(OUTLINE_OPEN_KEY) === "0") setOutlineOpen(false);
  }, []);
  const setOutlineVisible = useCallback((v: boolean) => {
    setOutlineOpen(v);
    writeLocal(OUTLINE_OPEN_KEY, v ? "1" : "0");
  }, []);
  // 有标题才谈开合：无标题时大纲与展开入口都不该出现
  const hasOutline = reading && outline.length > 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--panel)]">
      {/* 顶栏：左侧标识 / 退出阅读，右侧是排版主题入口，压到 40px 少占版面 */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--hairline-soft)] bg-[var(--panel)] px-4">
        {reading ? (
          <button
            className="-ml-1.5 flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-[12px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
            onClick={onExit}
            title="退出阅读模式（⌘⇧E）"
          >
            <ChevronLeft size={14} />
            退出阅读
          </button>
        ) : (
          <span className="text-[11px] tracking-[0.15em] text-[var(--ink-faint)]">公众号效果</span>
        )}
        {/* 右侧：主题入口常驻，阅读模式再多一段字数/时长 */}
        <span className="flex min-w-0 items-center gap-2">
          {reading ? <ReadingMeta /> : null}
          <ThemeTrigger themeName={themeName} />
        </span>
      </div>
      {/* 收起后的目录入口，落在 40px 顶栏下方的留白里，展开后交回大纲标题行的收起按钮 */}
      {hasOutline && !outlineOpen ? (
        <button
          type="button"
          title="展开目录"
          aria-label="展开目录"
          onClick={() => setOutlineVisible(true)}
          className="absolute left-1.5 top-[48px] z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
        >
          <AlignLeft size={15} strokeWidth={1.75} />
        </button>
      ) : null}
      <div
        ref={ref}
        className={`min-h-0 flex-1 overflow-y-auto px-6 ${reading ? "py-10" : "py-8"}`}
        onScroll={onScroll}
      >
        <style>{BASE_CSS}</style>
        <style>{codeCss}</style>
        <style>{themeCss}</style>
        <style>{tuneCss}</style>
        {customCss ? <style>{customCss}</style> : null}
        {/* 阅读模式的外层栅格：大纲 + 正文并排居中。双屏用 contents 把这层从布局里摘掉，
            正文列仍是滚动容器的直接子级，窄栏版式分毫不动 */}
        <div
          className={
            reading ? "mx-auto flex w-full max-w-[960px] justify-center gap-8" : "contents"
          }
        >
          {/* 大纲（桌面）：从渲染结果提取 h1~h3，点击平滑跳转；无标题或已收起时整条不渲染，
              正文照旧居中。sticky 相对外层 overflow-y-auto 的滚动容器生效 */}
          {hasOutline && outlineOpen ? (
            <OutlineNav
              outline={outline}
              onJump={jumpToHeading}
              onClose={() => setOutlineVisible(false)}
              className="hidden w-[190px] shrink-0 lg:block"
            />
          ) : null}
          {/* 双屏：手机阅读宽度，公众号文章以读者手机上的真实比例呈现，窄列 + 两侧留白
              让右栏与宽幅编辑区一眼可辨。阅读模式：宽出一截的 720px 通读长文，不做卡片、无边框阴影，
              居中让给外层 flex。两者夜间模式下文章面都保持日间白 */}
          <div
            className={
              reading
                ? "light-lock w-full max-w-[720px] bg-white px-6 py-8"
                : "light-lock mx-auto max-w-[420px] bg-white"
            }
          >
            {reading ? <ReadingTitle /> : null}
            <section
              id="nice"
              ref={sectionRef}
              data-tool="xedit"
              onClick={onContentClick}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
        <div className={reading ? "h-[30vh]" : "h-[40vh]"} />
      </div>
    </div>
  );
});
