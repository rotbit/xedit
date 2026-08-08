"use client";

import { forwardRef } from "react";
import { ChevronLeft } from "lucide-react";
import { BASE_CSS } from "@/lib/themes/base";
import { usePreviewRender } from "@/hooks/usePreviewRender";
import { ReadingMeta, ReadingTitle } from "@/features/editor/components/ReadingChrome";

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
  // 渲染管线（含 DOMPurify 消毒）：阅读模式不跟着击键跑，进来即渲染，不必防抖
  const { html, codeCss, themeCss, themeName, tuneCss, customCss } = usePreviewRender(
    reading ? 0 : 180
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--panel)]">
      {/* 顶栏：与左侧编辑工具栏同高、同底、同一条下边线，切换模式时这条线不跳 */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--hairline-soft)] bg-[var(--panel)] px-4">
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
        {reading ? (
          <ReadingMeta themeName={themeName} />
        ) : (
          <span className="max-w-[50%] truncate text-[12px] text-[var(--ink-soft)]">
            {themeName}
          </span>
        )}
      </div>
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
        {/* 双屏：手机阅读宽度，公众号文章以读者手机上的真实比例呈现，窄列 + 两侧留白
            让右栏与宽幅编辑区一眼可辨。阅读模式：宽出一截的 720px 白卡通读长文。
            两者夜间模式下文章面都保持日间白 */}
        <div
          className={
            reading
              ? "light-lock mx-auto w-full max-w-[720px] rounded-xl bg-white px-6 py-8 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_30px_rgba(0,0,0,0.04)]"
              : "light-lock mx-auto max-w-[420px] bg-white"
          }
        >
          {reading ? <ReadingTitle /> : null}
          <section
            id="nice"
            data-tool="xedit"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
        <div className={reading ? "h-[30vh]" : "h-[40vh]"} />
      </div>
    </div>
  );
});
