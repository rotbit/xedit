"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 编辑器 →「视口顶端是第几行」的广播通道，目录面板据此高亮当前章节。
 *
 * 为什么不抬成 state：滚动一次就 setState，整篇文章视图（编辑器、标题、字数…）
 * 跟着重渲染一遍，代价远大于高亮本身。这里只把行号推给订阅者自己消化，
 * 与选区上报（ArticleReader 的 selectionSubRef）、浮层菜单通道是同一套思路。
 */
export type SubscribeTopLine = (cb: (line: number) => void) => () => void;

export function useTopLineChannel() {
  const subsRef = useRef(new Set<(line: number) => void>());
  const lineRef = useRef(0);

  const publish = useCallback((line: number) => {
    lineRef.current = line;
    for (const cb of subsRef.current) cb(line);
  }, []);

  const subscribe = useCallback<SubscribeTopLine>((cb) => {
    subsRef.current.add(cb);
    cb(lineRef.current); // 订阅当下补发现值：面板后展开时不必等下一次滚动才亮
    return () => {
      subsRef.current.delete(cb);
    };
  }, []);

  return { publish, subscribe };
}

/**
 * 顶端行的提前量（行）：标题刚滚到视口顶就该算进入这一章。
 * 另一半作用是补目录跳转的 12px margin —— 跳过去之后标题顶端离容器顶还有 12px，
 * 顶端行会落在标题的前一行，没有余量就会差一格高亮到上一章。
 */
const LOOKAHEAD_LINES = 2;

/** 两次滚动上报隔了这么久，就认为跳转的平滑滚动已经结束、接下来是用户自己在滚 */
const PIN_QUIET_MS = 300;

/** 视口顶端所处的章节 = 最后一个起始行不超过顶端行的标题；还在第一个标题之前时返回 -1 */
function findActive(headings: readonly { line: number }[], topLine: number): number {
  const limit = topLine + LOOKAHEAD_LINES;
  let index = -1;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].line > limit) break; // headings 按行号升序，越过就不必再看
    index = i;
  }
  return index;
}

/**
 * 订阅顶端行号，算出当前章节在大纲里的下标。
 * 只有下标真的变了才 setState，滚过一整段长正文通常一次都不重渲染。
 *
 * @param active 面板收起时传 false：不订阅、不计算
 */
export function useActiveHeading(
  headings: readonly { line: number }[],
  subscribe: SubscribeTopLine | undefined,
  active: boolean
): { index: number; pin: (index: number) => void } {
  const [index, setIndex] = useState(-1);
  const indexRef = useRef(-1);
  /** 点击目录钉住的那一项，last 是最近一次滚动上报的时刻 */
  const pinRef = useRef<{ last: number } | null>(null);

  const apply = useCallback((next: number) => {
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
  }, []);

  /**
   * 点了哪项就亮哪项。文末的标题、正文很短的章节滚不到视口顶端，
   * 单看顶端行它们永远亮不起来，点了像没反应。
   */
  const pin = useCallback(
    (next: number) => {
      pinRef.current = { last: performance.now() };
      apply(next);
    },
    [apply]
  );

  useEffect(() => {
    if (!active || !subscribe) {
      apply(-1);
      return;
    }
    // headings 变（正文改了标题）也要重算：订阅当下会补发现值，重订阅顺手把这件事办了
    return subscribe((line) => {
      const pinned = pinRef.current;
      if (pinned) {
        // 跳转那段平滑滚动的上报是连着来的（间隔一帧），期间一概不理；
        // 隔了一阵再来的才是用户自己在滚，这时放开，回到按位置计算
        const now = performance.now();
        if (now - pinned.last < PIN_QUIET_MS) {
          pinned.last = now;
          return;
        }
        pinRef.current = null;
      }
      apply(findActive(headings, line));
    });
  }, [active, subscribe, headings, apply]);

  return { index, pin };
}
