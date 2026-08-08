"use client";

import { useEffect, useMemo, useState } from "react";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { resolveTheme, getCodeThemeCss, buildTuneCss } from "@/lib/themes";
import { useStore } from "@/store/useStore";

/**
 * 预览渲染管线：正文 → markdown-it → DOMPurify 消毒，并配齐主题 / 代码高亮 / 排版微调 CSS。
 * 双屏右栏与阅读模式共用这一条管线，两处所见必然一致。
 *
 * @param debounceMs 正文防抖间隔；跟着击键跑的场景给 180ms，一次性渲染给 0
 */
export function usePreviewRender(debounceMs = 180) {
  const content = useStore((s) => s.content);
  const themeId = useStore((s) => s.themeId);
  const customThemes = useStore((s) => s.customThemes);
  const codeThemeId = useStore((s) => s.codeThemeId);
  const customCss = useStore((s) => s.customCss);
  const macCode = useStore((s) => s.macCode);
  const tuneFontSize = useStore((s) => s.tuneFontSize);
  const tuneLineHeight = useStore((s) => s.tuneLineHeight);
  const tuneParaSpacing = useStore((s) => s.tuneParaSpacing);

  const [html, setHtml] = useState("");
  const [codeCss, setCodeCss] = useState("");
  const [mathReady, setMathReady] = useState(false);

  // MathJax（连字体 1MB+）只在正文疑似有公式时才拉，加载完成后重渲染一次，
  // 公式从降级原文变为 SVG。用 $ 粗筛：偶尔误判（价格符号）也只是多下一次，
  // 与从前的无条件加载相比只赚不亏。
  const mayHaveMath = content.includes("$");
  useEffect(() => {
    if (!mayHaveMath) return;
    void ensureMathJax().then(() => setMathReady(true));
  }, [mayHaveMath]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHtml(sanitizeHtml(renderMarkdown(content, { macCode })));
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [content, macCode, mathReady, debounceMs]);

  useEffect(() => {
    let cancelled = false;
    void getCodeThemeCss(codeThemeId).then((css) => {
      if (!cancelled) setCodeCss(css);
    });
    return () => {
      cancelled = true;
    };
  }, [codeThemeId]);

  // 自定义主题的 resolveTheme 会全量重建 CSS 字符串，别跟着每次击键渲染跑
  const theme = useMemo(() => resolveTheme(themeId, customThemes), [themeId, customThemes]);
  const tuneCss = useMemo(
    () => buildTuneCss({ tuneFontSize, tuneLineHeight, tuneParaSpacing }),
    [tuneFontSize, tuneLineHeight, tuneParaSpacing]
  );

  return { html, codeCss, themeCss: theme.css, themeName: theme.name, tuneCss, customCss };
}
