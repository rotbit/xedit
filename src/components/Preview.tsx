"use client";

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlignLeft, ChevronLeft } from "lucide-react";
import { BASE_CSS } from "@/lib/themes/base";
import { usePreviewRender } from "@/hooks/usePreviewRender";
import { useOutline } from "@/hooks/useOutline";
import { requestOpenWikiLink } from "@/lib/wikiLink";
import { OutlineNav } from "@/components/OutlineNav";
import { readLocal, writeLocal } from "@/features/workspace/lib/storage";
import { useT } from "@/i18n/useT";
import { ReadingMeta, ReadingTitle, ThemeTrigger } from "@/features/editor/components/ReadingChrome";
import { createPreviewUpdater } from "@/lib/markdown/preview";

/** Remembered open state of the reading-mode outline ("1" expanded / "0" collapsed, missing means expanded) */
const OUTLINE_OPEN_KEY = "xedit.readingOutlineOpen";

interface Props {
  onScroll?: () => void;
  /** split: right pane of the split view, narrow phone column + 「公众号效果」 (WeChat preview) top bar;
   *  reading: reading mode, the whole editing area becomes a 720px-wide finished article, with an exit in the top bar */
  variant?: "split" | "reading";
  /** Exit callback for reading mode */
  onExit?: () => void;
}

export const Preview = forwardRef<HTMLDivElement, Props>(function Preview(
  { onScroll, variant = "split", onExit },
  ref
) {
  const t = useT();
  const reading = variant === "reading";
  // Clicks on [[wiki links]]: the rendered output is injected HTML as a whole, with no React nodes to attach handlers to,
  // so delegation on the container is the only option. On click we just dispatch an event; finding the article is the app layer's job
  const onContentClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest?.("[data-wiki]")?.getAttribute("data-wiki");
    if (target) requestOpenWikiLink(target);
  };
  // Render pipeline (including DOMPurify sanitizing): reading mode doesn't follow keystrokes, it renders on entry, so no debounce
  const { blocks, codeCss, themeCss, themeName, tuneCss, customCss } = usePreviewRender(
    reading ? 0 : 180
  );
  // The outline only shows in reading mode. The hook is still called in both variants (React forbids conditional calls),
  // but the split view passes enabled=false so it doesn't scan the DOM
  const sectionRef = useRef<HTMLElement>(null);
  const updateRef = useRef<ReturnType<typeof createPreviewUpdater> | null>(null);
  // Update the body before the outline effect and browser paint, so the outline and synced scrolling still read this render's content.
  useLayoutEffect(() => {
    updateRef.current ??= createPreviewUpdater(sectionRef.current!);
    updateRef.current(blocks);
  }, [blocks]);
  const { outline, jumpToHeading } = useOutline(sectionRef, blocks, reading);
  // Outline open state: the initial value is fixed at true and localStorage is read back in useEffect —
  // lazy initialization would make the server-rendered first frame differ from the client and trip hydration
  const [outlineOpen, setOutlineOpen] = useState(true);
  useEffect(() => {
    if (readLocal(OUTLINE_OPEN_KEY) === "0") setOutlineOpen(false);
  }, []);
  const setOutlineVisible = useCallback((v: boolean) => {
    setOutlineOpen(v);
    writeLocal(OUTLINE_OPEN_KEY, v ? "1" : "0");
  }, []);
  // Open/close only matters with headings: without them neither the outline nor its expand entry should appear
  const hasOutline = reading && outline.length > 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--panel)]">
      {/* Top bar: brand / exit reading on the left, typography theme entry on the right, kept to 40px to save space */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--hairline-soft)] bg-[var(--panel)] px-4">
        {reading ? (
          <button
            className="-ml-1.5 flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-[12px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
            onClick={onExit}
            title={t("退出阅读模式（⌘⇧E）")}
          >
            <ChevronLeft size={14} />
            {t("退出阅读")}
          </button>
        ) : (
          <span className="text-[11px] tracking-[0.15em] text-[var(--ink-faint)]">{t("公众号效果")}</span>
        )}
        {/* Right side: the theme entry is always there; reading mode adds word count/reading time */}
        <span className="flex min-w-0 items-center gap-2">
          {reading ? <ReadingMeta /> : null}
          <ThemeTrigger themeName={themeName} />
        </span>
      </div>
      {/* Outline entry when collapsed, sitting in the gap below the 40px top bar; when expanded it hands back to the collapse button in the outline title row */}
      {hasOutline && !outlineOpen ? (
        <button
          type="button"
          title={t("展开目录")}
          aria-label={t("展开目录")}
          onClick={() => setOutlineVisible(true)}
          className="absolute left-1.5 top-[48px] z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
        >
          <AlignLeft size={16} />
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
        {/* Reading mode's outer grid: outline + body side by side, centered. The split view uses contents to drop this layer from layout,
            so the body column stays a direct child of the scroll container and the narrow layout is untouched */}
        <div
          className={
            reading ? "mx-auto flex w-full max-w-[960px] justify-center gap-8" : "contents"
          }
        >
          {/* Outline (desktop): extracts h1–h3 from the rendered output, click to smooth-scroll; not rendered at all without headings or when collapsed,
              and the body stays centered. sticky works relative to the outer overflow-y-auto scroll container */}
          {hasOutline && outlineOpen ? (
            <OutlineNav
              outline={outline}
              onJump={jumpToHeading}
              onClose={() => setOutlineVisible(false)}
              className="hidden w-[190px] shrink-0 lg:block"
            />
          ) : null}
          {/* Split view: phone reading width, so WeChat articles appear at the true proportions of a reader's phone; a narrow column with side margins
              makes the right pane instantly distinguishable from the wide editor. Reading mode: a wider 720px column for long reads, no card, no border or shadow,
              centering left to the outer flex. In dark mode both keep the article surface light */}
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
            />
          </div>
        </div>
        <div className={reading ? "h-[30vh]" : "h-[40vh]"} />
      </div>
    </div>
  );
});
