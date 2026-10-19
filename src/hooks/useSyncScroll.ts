"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { EditorHandle } from "@/lib/editor/types";
import { useStore } from "@/store/useStore";

export interface Anchor {
  line: number;
  top: number;
}

/** A cached set of anchors, plus the container size when measured (a size change reflows lines and invalidates all positions) */
interface AnchorCache {
  anchors: Anchor[];
  width: number;
  height: number;
}

/** Sync direction to run this frame; a later request in the same frame overrides an earlier one */
type Pending = { kind: "editor"; line: number; ratio: number } | { kind: "preview" };

/** Top padding: pinning an anchor flush to the container top feels too tight, so both directions leave this much room */
const EDGE_GAP = 24;

/** Vertical offset accumulated along the offsetParent chain (excluding scroll, pure layout coordinates) */
function offsetChainTop(el: HTMLElement): number {
  let top = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) {
    top += node.offsetTop;
  }
  return top;
}

/**
 * Positions of all data-line anchors in the preview, relative to the container's content origin.
 * Uses offsetTop rather than per-element getBoundingClientRect: the latter needs viewport coordinates,
 * meaning hundreds of layout reads for hundreds of anchors in long docs; offsetTop is a pure layout value and avoids reading scrollTop in the loop
 * (the container itself may not be on the offsetParent chain -- it's skipped when position:static -- so subtract the two chains).
 */
function collectAnchors(container: HTMLElement): Anchor[] {
  const base = offsetChainTop(container);
  const anchors: Anchor[] = [];
  for (const el of Array.from(container.querySelectorAll<HTMLElement>("#nice [data-line]"))) {
    const line = Number(el.dataset.line);
    if (Number.isNaN(line)) continue;
    anchors.push({ line, top: offsetChainTop(el) - base });
  }
  anchors.sort((a, b) => a.line - b.line);
  return anchors;
}

/**
 * Vertical position in the preview for a line number (may be fractional: the ratio scrolled within the line).
 * Interpolates between two anchors, otherwise scrolling through a long code block would leave the preview frozen.
 * Anchors are sorted by line ascending; returns 0 for an empty list. Pure function, unit tests feed it anchor lists directly.
 */
export function topForLine(anchors: Anchor[], target: number): number {
  if (anchors.length === 0) return 0;
  let prev = anchors[0];
  let next: Anchor | null = null;
  for (const a of anchors) {
    if (a.line <= target) prev = a;
    else {
      next = a;
      break;
    }
  }
  if (next && next.line !== prev.line) {
    const frac = (target - prev.line) / (next.line - prev.line);
    return prev.top + (next.top - prev.top) * frac;
  }
  return prev.top;
}

/** The reverse: which line a preview offset maps to (also interpolated between adjacent anchors); returns 0 for an empty list */
export function lineForTop(anchors: Anchor[], top: number): number {
  if (anchors.length === 0) return 0;
  let prev = anchors[0];
  let next: Anchor | null = null;
  for (const a of anchors) {
    if (a.top <= top) prev = a;
    else {
      next = a;
      break;
    }
  }
  if (next && next.top !== prev.top) {
    const frac = (top - prev.top) / (next.top - prev.top);
    return prev.line + (next.line - prev.line) * frac;
  }
  return prev.line;
}

/**
 * Two-way synced scrolling between the editor and the preview.
 * The pane that most recently got the pointer is the "driver", to avoid the two triggering each other in a loop.
 *
 * Two performance constraints:
 * 1. Scroll events can fire several times per frame, so they're coalesced with rAF and computed at most once per frame (like FloatingToolbar);
 * 2. The anchor list is cached by "has the preview DOM changed + container size" instead of rescanning the DOM on every scroll.
 *    DOM changes only set a dirty flag via MutationObserver; the heavy work is deferred until next use.
 *    Images loading, fonts arriving, and font size/theme changes only change heights, not structure, which MutationObserver can't see,
 *    so a ResizeObserver + img load events + document.fonts.ready also mark it dirty.
 */
export function useSyncScroll(
  editorRef: RefObject<EditorHandle | null>,
  previewRef: RefObject<HTMLDivElement | null>
) {
  const activePane = useRef<"editor" | "preview" | null>(null);

  const setActive = useCallback((pane: "editor" | "preview") => {
    activePane.current = pane;
  }, []);

  // -- Anchor cache --
  const cacheRef = useRef<AnchorCache | null>(null);
  const dirtyRef = useRef(true);
  const observedRef = useRef<HTMLElement | null>(null);
  /** Detach the whole set of listeners (observers + events) from the current container; called on container change and unmount */
  const detachRef = useRef<(() => void) | null>(null);
  const fontsWatchedRef = useRef(false);

  /** The preview container is mounted conditionally (unmounted when collapsed), so observers attach on first use and reattach when it changes */
  const watch = useCallback((container: HTMLElement) => {
    if (observedRef.current === container) return;
    detachRef.current?.();

    const markDirty = () => {
      dirtyRef.current = true;
    };

    // Body re-renders, image/formula replacements and theme style changes all touch the subtree, so invalidate
    const mo = new MutationObserver(markDirty);
    mo.observe(container, { childList: true, subtree: true, characterData: true });

    // Invalidate on height change: images finishing decode, font size/line height changes, and window resizes all come through here.
    // Only set the flag in the callback without measuring -- reading offsetTop in a ResizeObserver callback forces a synchronous layout,
    // and the anchors aren't needed until the next scroll, so measure then.
    const ro = new ResizeObserver(markDirty);
    ro.observe(container);
    const root = container.querySelector<HTMLElement>("#nice");
    if (root) ro.observe(root);

    // Image load events don't bubble, so listen in the capture phase on the container; one loaded image pushes every later anchor down
    container.addEventListener("load", markDirty, true);
    container.addEventListener("error", markDirty, true);

    // Fonts arriving reflow the whole doc; marking dirty once is enough, later height changes are handled by ResizeObserver
    if (!fontsWatchedRef.current) {
      fontsWatchedRef.current = true;
      void document.fonts?.ready.then(markDirty).catch(() => {});
    }

    detachRef.current = () => {
      mo.disconnect();
      ro.disconnect();
      container.removeEventListener("load", markDirty, true);
      container.removeEventListener("error", markDirty, true);
    };
    observedRef.current = container;
    dirtyRef.current = true;
  }, []);

  const anchorsOf = useCallback(
    (container: HTMLElement): Anchor[] => {
      watch(container);
      const width = container.clientWidth;
      const height = container.clientHeight;
      const cache = cacheRef.current;
      if (cache && !dirtyRef.current && cache.width === width && cache.height === height) {
        return cache.anchors;
      }
      const anchors = collectAnchors(container);
      cacheRef.current = { anchors, width, height };
      dirtyRef.current = false;
      return anchors;
    },
    [watch]
  );

  /** Editor scrolls → preview follows */
  const editorToPreview = useCallback(
    (line: number, ratio: number) => {
      const container = previewRef.current;
      if (!container) return;

      const anchors = anchorsOf(container);
      if (anchors.length === 0) return;
      const top = topForLine(anchors, line + ratio);
      container.scrollTo({ top: Math.max(0, top - EDGE_GAP) });
    },
    [anchorsOf, previewRef]
  );

  /** Preview scrolls → editor follows */
  const previewToEditor = useCallback(() => {
    const container = previewRef.current;
    const view = editorRef.current?.view();
    if (!container || !view) return;

    const anchors = anchorsOf(container);
    if (anchors.length === 0) return;
    // Read once outside the loop: scrollTop is a layout property, reading it in the loop would force repeated synchronous layouts
    const targetLine = lineForTop(anchors, container.scrollTop + EDGE_GAP);

    // The scroll container may be the editor's outer wrapper (title area scrolls with the body), so let the editor handle the conversion
    const doc = view.state.doc;
    const line = Math.min(doc.lines - 1, Math.max(0, Math.floor(targetLine)));
    editorRef.current?.scrollLineToTop(line);
  }, [anchorsOf, editorRef, previewRef]);

  // -- rAF frame coalescing --
  const pendingRef = useRef<Pending | null>(null);
  const rafRef = useRef(0);

  const schedule = useCallback(
    (job: Pending) => {
      pendingRef.current = job;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const last = pendingRef.current;
        pendingRef.current = null;
        if (!last) return;
        // Recheck the driver inside the frame: the pointer may have moved to the other side within this frame
        if (last.kind === "editor") {
          if (activePane.current === "editor") editorToPreview(last.line, last.ratio);
        } else if (activePane.current === "preview") {
          previewToEditor();
        }
      });
    },
    [editorToPreview, previewToEditor]
  );

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      detachRef.current?.();
      detachRef.current = null;
      observedRef.current = null;
    },
    []
  );

  const onEditorScrollLine = useCallback(
    (line: number, ratio: number) => {
      if (!useStore.getState().syncScroll) return;
      if (activePane.current !== "editor") return;
      schedule({ kind: "editor", line, ratio });
    },
    [schedule]
  );

  const onPreviewScroll = useCallback(() => {
    if (!useStore.getState().syncScroll) return;
    if (activePane.current !== "preview") return;
    schedule({ kind: "preview" });
  }, [schedule]);

  return { setActive, onEditorScrollLine, onPreviewScroll };
}
