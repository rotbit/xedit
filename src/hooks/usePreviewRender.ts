"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getLocalBackend, LOCAL_BACKEND_CHANGED_EVENT } from "@/lib/localBackend";
import { ATTACHMENTS_RESOLVED_EVENT } from "@/lib/localBackend/attachmentUrls";
import { createPreviewRenderer, type PreviewBlock } from "@/lib/markdown/preview";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { resolveTheme, getCodeThemeCss, buildTuneCss } from "@/lib/themes";
import { useStore } from "@/store/useStore";

/**
 * Preview render pipeline: body → markdown-it → DOMPurify sanitizing, plus theme / code highlighting / typography tweak CSS.
 * The split view's right pane and reading mode share this pipeline, so both always look the same.
 *
 * @param debounceMs Body debounce interval; 180ms when following keystrokes, 0 for one-off renders
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

  const [blocks, setBlocks] = useState<PreviewBlock[]>([]);
  const [render] = useState(createPreviewRenderer);
  const [codeCss, setCodeCss] = useState("");
  const [mathReady, setMathReady] = useState(false);

  // Attachment resolution is async, and the body may have changed several times by the time the event arrives; the handler reads the current body from a ref
  // so we don't resubscribe on every keystroke just to keep "the body hasn't changed" accurate
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  /** Only disk libraries have local attachments; cloud mode doesn't even need the subscription */
  const [vaultMode, setVaultMode] = useState(false);
  useEffect(() => {
    const sync = () => setVaultMode(getLocalBackend().kind === "vault");
    sync();
    window.addEventListener(LOCAL_BACKEND_CHANGED_EVENT, sync);
    return () => window.removeEventListener(LOCAL_BACKEND_CHANGED_EVENT, sync);
  }, []);

  /** Local library attachments are read asynchronously: re-render after each batch so placeholders become real images */
  const [attachmentTick, setAttachmentTick] = useState(0);
  useEffect(() => {
    if (!vaultMode) return;
    const onResolved = (e: Event) => {
      const keys = (e as CustomEvent<{ keys?: string[] }>).detail?.keys;
      // Only re-render if this batch includes an image this doc references: if some other doc's images resolved
      // and this doc hasn't changed, there's no reason to rerun the whole Markdown. Events without keys are treated as "everything"
      if (keys && !keys.some((key) => contentRef.current.includes(key))) return;
      setAttachmentTick((n) => n + 1);
    };
    window.addEventListener(ATTACHMENTS_RESOLVED_EVENT, onResolved);
    return () => window.removeEventListener(ATTACHMENTS_RESOLVED_EVENT, onResolved);
  }, [vaultMode]);

  // MathJax (1MB+ with fonts) is only fetched when the body looks like it has formulas, then re-renders once
  // so formulas go from the raw fallback to SVG. A rough $ check: an occasional false positive (a price sign) just means one extra download,
  // which is still strictly better than the old unconditional load.
  const mayHaveMath = content.includes("$");
  useEffect(() => {
    if (!mayHaveMath) return;
    // Loading takes a few seconds; the doc may have changed or the preview unmounted by then, so drop stale results
    let cancelled = false;
    void ensureMathJax().then(() => {
      if (!cancelled) setMathReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [mayHaveMath]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setBlocks(render(content, { macCode }));
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [content, macCode, mathReady, attachmentTick, debounceMs, render]);

  useEffect(() => {
    let cancelled = false;
    void getCodeThemeCss(codeThemeId).then((css) => {
      if (!cancelled) setCodeCss(css);
    });
    return () => {
      cancelled = true;
    };
  }, [codeThemeId]);

  // A custom theme's resolveTheme rebuilds the whole CSS string, so don't run it on every keystroke render
  const theme = useMemo(() => resolveTheme(themeId, customThemes), [themeId, customThemes]);
  const tuneCss = useMemo(
    () => buildTuneCss({ tuneFontSize, tuneLineHeight, tuneParaSpacing }),
    [tuneFontSize, tuneLineHeight, tuneParaSpacing]
  );

  return { blocks, codeCss, themeCss: theme.css, themeName: theme.name, tuneCss, customCss };
}
