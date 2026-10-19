"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

export interface OutlineItem {
  level: number;
  text: string;
}

/**
 * Left indent of outline rows (px): 8 is the list's own padding, plus 14 per heading level.
 * The editor side (OutlinePanel, parsed from Markdown source) and the reading/share side (OutlineNav, extracted from the DOM)
 * use different data sources but must indent identically, so the formula lives only here.
 */
export const outlineIndent = (level: number) => 8 + (level - 1) * 14;

/** Always return this one empty array when the outline is hidden: a stable reference, so setOutline with the same value doesn't trigger another render */
const NO_OUTLINE: OutlineItem[] = [];

/**
 * Outline: extracts h1-h3 from the rendered body DOM and smooth-scrolls to them by index.
 * Shared by the share page and the editor's reading mode, so both outlines are extracted the same way.
 *
 * @param rootRef Body container (h1-h3 are looked up in its subtree)
 * @param content Body HTML or preview blocks; the outline is re-extracted whenever it changes
 * @param enabled Whether this view needs an outline. When false, no DOM query runs at all --
 *                the split view's right pane hides the outline but shares the preview component with reading mode, so it would rescan headings on every body change
 */
export function useOutline(
  rootRef: RefObject<HTMLElement | null>,
  content: string | readonly unknown[],
  enabled = true
) {
  const [outline, setOutline] = useState<OutlineItem[]>(NO_OUTLINE);

  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root || content.length === 0) {
      setOutline(NO_OUTLINE);
      return;
    }
    setOutline(
      Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3")).map((h) => ({
        level: Number(h.tagName.slice(1)),
        text: h.textContent?.trim() ?? "",
      }))
    );
  }, [rootRef, content, enabled]);

  const jumpToHeading = useCallback(
    (index: number) => {
      const headings = rootRef.current?.querySelectorAll<HTMLElement>("h1, h2, h3");
      headings?.[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [rootRef]
  );

  return { outline, jumpToHeading };
}
