"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

export interface OutlineItem {
  level: number;
  text: string;
}

/**
 * 大纲行的左缩进（px）：8 是列表自身的内边距，层级每深一级再多缩 14。
 * 编辑器侧（OutlinePanel，从 Markdown 源码解析）与阅读/分享侧（OutlineNav，从 DOM 提取）
 * 数据源不同但缩进必须对齐，所以公式只留这一份。
 */
export const outlineIndent = (level: number) => 8 + (level - 1) * 14;

/** 不显示大纲时统一给这一个空数组：引用稳定，setOutline 同值不会再触发一轮渲染 */
const NO_OUTLINE: OutlineItem[] = [];

/**
 * 大纲：从已渲染的正文 DOM 里提取 h1~h3，并按序号平滑跳转。
 * 分享页与编辑器阅读模式共用，两处大纲的提取口径必然一致。
 *
 * @param rootRef 正文容器（h1~h3 从它的子树里找）
 * @param html    正文 HTML，变一次就重新提取一次
 * @param enabled 这个视图要不要大纲。false 时一次 DOM 查询都不做——
 *                双屏右栏不露大纲，却和阅读模式共用预览组件，正文每变一次就白扫一遍标题
 */
export function useOutline(
  rootRef: RefObject<HTMLElement | null>,
  html: string,
  enabled = true
) {
  const [outline, setOutline] = useState<OutlineItem[]>(NO_OUTLINE);

  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root || !html) {
      setOutline(NO_OUTLINE);
      return;
    }
    setOutline(
      Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3")).map((h) => ({
        level: Number(h.tagName.slice(1)),
        text: h.textContent?.trim() ?? "",
      }))
    );
  }, [rootRef, html, enabled]);

  const jumpToHeading = useCallback(
    (index: number) => {
      const headings = rootRef.current?.querySelectorAll<HTMLElement>("h1, h2, h3");
      headings?.[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [rootRef]
  );

  return { outline, jumpToHeading };
}
