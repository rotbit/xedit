"use client";

import { forwardRef, useEffect, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
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
  const previewMode = useStore((s) => s.previewMode);

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
  const setPreviewMode = useStore((s) => s.setPreviewMode);
  const phone = previewMode === "phone";

  return (
    <div className="desk relative h-full min-h-0 overflow-hidden">
      {/* 宽屏 / 手机 预览切换 */}
      <div className="absolute right-4 top-4 z-20 flex overflow-hidden rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)]/90 shadow-sm backdrop-blur">
        {(
          [
            ["pc", <Monitor key="pc" size={13} />, "宽屏预览"],
            ["phone", <Smartphone key="ph" size={13} />, "手机预览"],
          ] as const
        ).map(([mode, icon, label]) => (
          <button
            key={mode}
            className={`flex h-7 w-8 cursor-pointer items-center justify-center ${
              previewMode === mode
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--paper)]"
            }`}
            title={label}
            onClick={() => setPreviewMode(mode)}
          >
            {icon}
          </button>
        ))}
      </div>
      <div ref={ref} className="h-full overflow-y-auto px-6 py-6" onScroll={onScroll}>
        <style>{BASE_CSS}</style>
        <style>{codeCss}</style>
        <style>{theme.css}</style>
        <style>{buildTuneCss({ tuneFontSize, tuneLineHeight, tuneParaSpacing })}</style>
        {customCss ? <style>{customCss}</style> : null}
        <div
          className={
            phone
              ? "light-lock mx-auto w-[375px] rounded-[38px] border-[10px] border-[#1f1f1f] bg-white shadow-[0_18px_50px_rgba(0,0,0,0.18)] overflow-hidden"
              : "light-lock mx-auto max-w-[720px] rounded-sm bg-white shadow-[0_2px_16px_rgba(0,0,0,0.08)] ring-1 ring-[var(--hairline)]"
          }
        >
          {phone ? (
            <div className="flex h-7 items-center justify-center bg-[#1f1f1f]">
              <div className="h-4 w-24 rounded-b-xl bg-[#1f1f1f]" />
            </div>
          ) : null}
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
