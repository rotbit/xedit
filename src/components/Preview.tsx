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
    <div className="desk relative h-full min-h-0 overflow-hidden">
      <div ref={ref} className="h-full overflow-y-auto px-6 py-6" onScroll={onScroll}>
        <style>{BASE_CSS}</style>
        <style>{codeCss}</style>
        <style>{theme.css}</style>
        <style>{buildTuneCss({ tuneFontSize, tuneLineHeight, tuneParaSpacing })}</style>
        {customCss ? <style>{customCss}</style> : null}
        <div className="light-lock mx-auto max-w-[720px] rounded-sm bg-white shadow-[0_2px_16px_rgba(0,0,0,0.08)] ring-1 ring-[var(--hairline)]">
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
