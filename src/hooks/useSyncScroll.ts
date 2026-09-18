"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { EditorHandle } from "@/lib/editor/types";
import { useStore } from "@/store/useStore";

export interface Anchor {
  line: number;
  top: number;
}

/** 缓存的一批锚点，连同量算时的容器尺寸（尺寸一变换行就变，位置全作废） */
interface AnchorCache {
  anchors: Anchor[];
  width: number;
  height: number;
}

/** 这一帧要做的同步方向；同一帧内后来的覆盖先来的 */
type Pending = { kind: "editor"; line: number; ratio: number } | { kind: "preview" };

/** 顶部留白：锚点顶到容器顶上会顶得太死，两个方向都让开这么多 */
const EDGE_GAP = 24;

/** 沿 offsetParent 链累加的纵坐标（不含滚动量，纯布局坐标） */
function offsetChainTop(el: HTMLElement): number {
  let top = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) {
    top += node.offsetTop;
  }
  return top;
}

/**
 * 预览里所有带 data-line 的锚点相对容器内容原点的位置。
 * 用 offsetTop 而不是逐元素 getBoundingClientRect：后者要拿视口坐标，
 * 长文几百个锚点就是几百次布局读取；offsetTop 是纯布局值，且不用在循环里读 scrollTop
 * （容器自身可能不在 offsetParent 链上——它 position:static 时会被跳过——所以两条链相减）。
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
 * 行号（可带小数：行内滚过的比例）落在预览里的纵坐标。
 * 两个锚点之间按比例插值，否则一段长代码块里滚半天预览纹丝不动。
 * 锚点按 line 升序，空表返回 0。纯函数，单测直接喂锚点表。
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

/** 反过来：预览的纵坐标落在哪一行（同样按相邻锚点插值），空表返回 0 */
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
 * 编辑器与预览的双向同步滚动。
 * 以最近获得指针的窗格为“主动方”，避免互相触发形成回环。
 *
 * 两处性能约束：
 * 1. 滚动事件一帧能来好几个，这里统一 rAF 合帧，一帧最多算一次（同 FloatingToolbar）；
 * 2. 锚点表按「预览 DOM 有没有变 + 容器尺寸」缓存，不再每次滚动都重新扫一遍 DOM。
 *    DOM 变化用 MutationObserver 只置一个脏标记，真正重量推到下一次用到时。
 *    图片读出来、字体落地、字号/主题改版式都只改高度不改结构，MutationObserver 看不见，
 *    所以另配 ResizeObserver + img 的 load 事件 + document.fonts.ready 一起标脏。
 */
export function useSyncScroll(
  editorRef: RefObject<EditorHandle | null>,
  previewRef: RefObject<HTMLDivElement | null>
) {
  const activePane = useRef<"editor" | "preview" | null>(null);

  const setActive = useCallback((pane: "editor" | "preview") => {
    activePane.current = pane;
  }, []);

  // —— 锚点缓存 ——
  const cacheRef = useRef<AnchorCache | null>(null);
  const dirtyRef = useRef(true);
  const observedRef = useRef<HTMLElement | null>(null);
  /** 解绑当前容器上的一整套监听（观察器 + 事件），换容器与卸载时调用 */
  const detachRef = useRef<(() => void) | null>(null);
  const fontsWatchedRef = useRef(false);

  /** 预览容器是条件挂载的（收起时卸载），所以观察器在第一次用到时才挂，容器换了重挂 */
  const watch = useCallback((container: HTMLElement) => {
    if (observedRef.current === container) return;
    detachRef.current?.();

    const markDirty = () => {
      dirtyRef.current = true;
    };

    // 正文重渲染、图片/公式替换、主题 style 变更都会改到子树，一律作废
    const mo = new MutationObserver(markDirty);
    mo.observe(container, { childList: true, subtree: true, characterData: true });

    // 高度变了就作废：图片解码完、字号/行高改了、窗口缩放都走这条。
    // 回调里只置标记不量布局——在 ResizeObserver 回调里读 offsetTop 会当场触发同步布局，
    // 而真正要用锚点是下一次滚动的事，等到那时再量。
    const ro = new ResizeObserver(markDirty);
    ro.observe(container);
    const root = container.querySelector<HTMLElement>("#nice");
    if (root) ro.observe(root);

    // 图片的 load 不冒泡，只能在容器上捕获阶段听；一张图读出来就把后面所有锚点顶下去了
    container.addEventListener("load", markDirty, true);
    container.addEventListener("error", markDirty, true);

    // 字体落地会重排整篇；只标一次脏就够，之后的高度变化归 ResizeObserver 管
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

  /** 编辑器滚动 → 预览跟随 */
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

  /** 预览滚动 → 编辑器跟随 */
  const previewToEditor = useCallback(() => {
    const container = previewRef.current;
    const view = editorRef.current?.view();
    if (!container || !view) return;

    const anchors = anchorsOf(container);
    if (anchors.length === 0) return;
    // 循环外读一次：scrollTop 是布局属性，循环里读会反复触发同步布局
    const targetLine = lineForTop(anchors, container.scrollTop + EDGE_GAP);

    // 滚动容器可能是编辑器外层（标题区与正文同滚），统一交给编辑器句柄换算
    const doc = view.state.doc;
    const line = Math.min(doc.lines - 1, Math.max(0, Math.floor(targetLine)));
    editorRef.current?.scrollLineToTop(line);
  }, [anchorsOf, editorRef, previewRef]);

  // —— rAF 合帧 ——
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
        // 帧里再核一次主动方：这一帧内指针可能已经挪到另一侧
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
