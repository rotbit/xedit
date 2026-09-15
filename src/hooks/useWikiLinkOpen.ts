"use client";

import { useEffect, useRef } from "react";
import { askConfirm } from "@/components/PromptDialog";
import { normalizeTitle, WIKI_OPEN_EVENT } from "@/lib/wikiLink";
import type { DocMeta } from "@/features/workspace/types";

interface WikiLinkOpenParams {
  /** 解析目标用的文章列表（不含回收站） */
  docs: DocMeta[];
  /** 当前文章的分类：新建的目标文章沿用它，一组互链的文章自然留在一处 */
  category: string;
  openDoc: (id: string) => void;
  createDoc: (category: string, init: { title: string }) => void | Promise<void>;
}

/**
 * 接住编辑器 / 预览里 `[[双向链接]]` 的点击：按标题找文章，没找到就问要不要新建。
 * 渲染层（CodeMirror 装饰、预览 HTML）都不认识文库，只派事件，解析落在这里。
 */
export function useWikiLinkOpen(params: WikiLinkOpenParams) {
  // docs 与回调每次渲染都是新引用，用 ref 兜住最新值：
  // 监听器只挂一次，不必每敲一个字就把 window 上的监听摘了重挂
  const latest = useRef(params);
  useEffect(() => {
    latest.current = params;
  });

  useEffect(() => {
    const onOpen = (event: Event) => {
      const target = (event as CustomEvent<{ target?: string }>).detail?.target?.trim();
      if (!target) return;
      const { docs, category, openDoc, createDoc } = latest.current;
      const key = normalizeTitle(target);
      const hit = docs.find((d) => normalizeTitle(d.title) === key);
      if (hit) {
        openDoc(hit.id);
        return;
      }
      // 目标还不存在：Obsidian 的做法是直接建空文章，这里多问一句——
      // 点错一个链接就凭空多出一篇文章，在「文章」而非「笔记」的语境下更扰人
      void askConfirm({
        title: "文章不存在",
        message: `文章「${target}」还不存在，是否新建并打开？`,
        confirmText: "新建",
      }).then((ok) => {
        if (ok) void createDoc(category, { title: target });
      });
    };
    window.addEventListener(WIKI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(WIKI_OPEN_EVENT, onOpen);
  }, []);
}
