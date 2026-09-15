"use client";

import { useCallback, useEffect, useRef } from "react";
import { askConfirm } from "@/components/PromptDialog";
import { toast } from "@/components/Toast";
import { notifyDocsChanged } from "@/lib/localDocs";
import {
  applyRenameLinks,
  findLinkingDocs,
  isLinkableTitle,
} from "@/lib/renameLinks";
import { normalizeTitle } from "@/lib/wikiLink";
import type { DocMeta } from "@/features/workspace/types";

/** 占位标题：没人会去链接一篇「未命名文章」，两头都当作「没有标题」处理 */
const UNTITLED = "未命名文章";

interface Params {
  docId: string;
  /** 全部文章（不含回收站）；未装载时为 undefined */
  docs?: DocMeta[];
  /** 当前标题（store 里的实时值） */
  title: string;
  /** 变化即表示换了文档 / 重新装载，旧标题的记忆必须作废 */
  docVersion: number;
  /**
   * 改完别人的正文后刷新文库。默认广播 DOCS_CHANGED —— 本地库与云端镜像的写入
   * 本来就会广播，useDocLibrary 听着这条事件重读列表，新的 updatedAt 一到，
   * docIndex 的缓存键随之失效，侧栏与检索自然跟上。
   */
  refresh?: () => void;
}

/**
 * 改标题后，把别的文章里指向它的 `[[双向链接]]` 一并改掉（Obsidian 的 rename 更新引用）。
 *
 * 时机选在标题输入框的 focus / blur 而不是每次击键：改标题是逐字敲出来的，
 * 中途每一个中间态都去扫全库、弹确认框，只会把人烦死。聚焦记下原样，
 * 失焦拿到定稿，中间敲了什么都不算数。
 *
 * 当前这一篇的标题怎么落盘不归这里管（自动保存管线已经在做），
 * 这里只负责「别人怎么称呼它」。
 */
export function useRenameLinks({ docId, docs, title, docVersion, refresh }: Params) {
  /** 聚焦那一刻的标题原样（含「未命名文章」占位），null 表示没在编辑标题 */
  const beforeEditRef = useRef<string | null>(null);
  /** 确认框一次只该有一个：askConfirm 的第二次调用会顶掉第一次，前一个 Promise 就永远悬着了 */
  const busyRef = useRef(false);

  // 换了文档（或本篇被云端新版本替换）就作废记忆，免得把 A 的旧标题算到 B 头上
  useEffect(() => {
    beforeEditRef.current = null;
  }, [docId, docVersion]);

  const run = useCallback(
    async (oldTitle: string, newTitle: string) => {
      const targets = findLinkingDocs(docs ?? [], oldTitle, docId);
      if (targets.length === 0) return;
      busyRef.current = true;
      try {
        const ok = await askConfirm({
          title: "更新双向链接",
          message: `有 ${targets.length} 篇文章链接到「${oldTitle}」，一并改成「${newTitle}」？`,
          confirmText: "一并更新",
        });
        if (!ok) return;
        const { updated, failed } = await applyRenameLinks(targets, oldTitle, newTitle);
        (refresh ?? notifyDocsChanged)();
        if (updated > 0) toast(`已更新 ${updated} 篇文章的链接`, "success");
        if (failed > 0) toast(`${failed} 篇文章的链接更新失败`, "error");
      } finally {
        busyRef.current = false;
      }
    },
    [docs, docId, refresh]
  );

  /** 标题输入框获得焦点：记下原样。必须在调用方把「未命名文章」清空之前调用 */
  const onTitleFocus = useCallback(() => {
    if (busyRef.current) return;
    beforeEditRef.current = title;
  }, [title]);

  /** 标题输入框失焦：这一轮编辑的定稿出来了，该改的引用在这里改 */
  const onTitleBlur = useCallback(() => {
    const before = beforeEditRef.current;
    beforeEditRef.current = null;
    if (before === null || busyRef.current) return;

    const oldTitle = before.trim();
    const newTitle = title.trim();
    // 原来没有标题（新稿、占位）就没人链得上；新标题为空调用方会填回占位，同样不算改名
    if (!oldTitle || oldTitle === UNTITLED) return;
    if (!newTitle || newTitle === UNTITLED) return;
    if (normalizeTitle(oldTitle) === normalizeTitle(newTitle)) return;
    // 带方括号 / 竖线的标题写进 `[[…]]` 会把链接结构本身弄坏，宁可不动
    if (!isLinkableTitle(newTitle)) return;
    void run(oldTitle, newTitle);
  }, [title, run]);

  return { onTitleFocus, onTitleBlur };
}
