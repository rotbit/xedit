"use client";

/**
 * 审核模式的版式尺寸：正文列多宽、意见栏摆不摆得下。
 *
 * 定的第一条规矩是「正文列一个像素都不让」——上一版把编辑区压窄给意见腾地方，
 * 结果作者写字的地方比看意见的地方还挤。现在改成正文列保持 760 不动，
 * 整体（正文 + 意见栏）作为一对居中，也就是正文只往左挪一点点。
 *
 * 容器实在摆不下这一对（窗口小、目录展开着）时不摆栏：改成选中哪条，
 * 就在那句话底下浮一张卡片。
 */

import { useEffect, useState } from "react";

/** 正文列宽（与 editor.css 里 .cm-doc 的 max-width: 760px 一致，不许改） */
export const ARTICLE_WIDTH = 760;
/** 意见栏宽度 */
export const CARD_COL_WIDTH = 260;
/** 正文与意见栏之间的间距，也是卡片之间的最小间距 */
export const CARD_GAP = 16;
/** 摆得下意见栏所需的容器净宽 */
export const REVIEW_MIN_WIDTH = ARTICLE_WIDTH + CARD_GAP + CARD_COL_WIDTH;

/**
 * 盯住滚动容器的宽度，决定摆不摆意见栏。
 * 目录面板开合、窗口缩放都会改这个宽度，ResizeObserver 一并收住。
 */
export function useReviewLayout({
  active,
  scrollEl,
}: {
  active: boolean;
  /** 标题 + 正文的共同滚动容器 */
  scrollEl: HTMLElement | null;
}): { showColumn: boolean; width: number } {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!active || !scrollEl) return;
    // 不另外同步读一次：observe 之后 ResizeObserver 会在首次绘制前先回调一轮
    const ro = new ResizeObserver(() => setWidth(scrollEl.clientWidth));
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, [active, scrollEl]);

  // 还没量到就当摆得下：真窄也就第一帧摆出来又收走，
  // 反过来（先浮层再变栏）看着像界面自己抽了一下
  return { showColumn: active && (width === 0 || width >= REVIEW_MIN_WIDTH), width };
}
