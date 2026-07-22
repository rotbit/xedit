"use client";

import { forwardRef, useEffect, useState } from "react";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { BASE_CSS } from "@/lib/themes/base";
import { getTheme, getCodeThemeCss, buildTuneCss } from "@/lib/themes";
import { useStore } from "@/store/useStore";

interface Props {
  onScroll?: () => void;
}

export const Preview = forwardRef<HTMLDivElement, Props>(function Preview({ onScroll }, ref) {
  const content = useStore((s) => s.content);
  const themeId = useStore((s) => s.themeId);
  const codeThemeId = useStore((s) => s.codeThemeId);
  const customCss = useStore((s) => s.customCss);
  const macCode = useStore((s) => s.macCode);
  const tuneFontSize = useStore((s) => s.tuneFontSize);
  const tuneLineHeight = useStore((s) => s.tuneLineHeight);
  const tuneParaSpacing = useStore((s) => s.tuneParaSpacing);

  const [html, setHtml] = useState("");
  const [codeCss, setCodeCss] = useState("");
  const [mathReady, setMathReady] = useState(false);

  // MathJax 动态加载完成后重渲染一次，公式从降级原文变为 SVG
  useEffect(() => {
    void ensureMathJax().then(() => setMathReady(true));
  }, []);

  // 渲染防抖：输入停顿 180ms 后更新预览。
  // renderMarkdown 结果统一经 sanitizeHtml（DOMPurify）消毒后才进入 DOM。
  useEffect(() => {
    const timer = setTimeout(() => {
      setHtml(sanitizeHtml(renderMarkdown(content, { macCode })));
    }, 180);
    return () => clearTimeout(timer);
  }, [content, macCode, mathReady]);

  useEffect(() => {
    let cancelled = false;
    void getCodeThemeCss(codeThemeId).then((css) => {
      if (!cancelled) setCodeCss(css);
    });
    return () => {
      cancelled = true;
    };
  }, [codeThemeId]);

  const theme = getTheme(themeId);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--panel)]">
      {/* 顶栏：与左侧编辑工具栏同高、同底、同一条下边线，双屏在同一水平线上衔接 */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--hairline-soft)] bg-[var(--panel)] px-4">
        <span className="text-[11px] tracking-[0.15em] text-[var(--ink-faint)]">公众号效果</span>
        <span className="max-w-[50%] truncate text-[12px] text-[var(--ink-soft)]">
          {theme.name}
        </span>
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto px-6 py-8" onScroll={onScroll}>
        <style>{BASE_CSS}</style>
        <style>{codeCss}</style>
        <style>{theme.css}</style>
        <style>{buildTuneCss({ tuneFontSize, tuneLineHeight, tuneParaSpacing })}</style>
        {customCss ? <style>{customCss}</style> : null}
        {/* 手机阅读宽度：公众号文章以读者手机上的真实比例呈现，
            窄列 + 两侧留白让右栏与宽幅编辑区一眼可辨；夜间模式下文章面依旧保持日间白 */}
        <div className="light-lock mx-auto max-w-[420px] bg-white">
          <section
            id="nice"
            data-tool="xedit"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
        <div className="h-[40vh]" />
      </div>
    </div>
  );
});
