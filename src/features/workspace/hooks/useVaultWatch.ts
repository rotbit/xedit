"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/Toast";
import { hasPendingContent, rememberSavedDocument } from "@/lib/editor/persistence";
import {
  getLocalDocContent,
  listLocalDocs,
  notifyDocReplaced,
  notifyDocsChanged,
} from "@/lib/localDocs";
import { forgetMissingAttachments } from "@/lib/localBackend/attachmentUrls";
import { rescanVault } from "@/lib/localBackend/vaultSession";
import { useStore } from "@/store/useStore";
import { UNCATEGORIZED } from "../constants";
import type { WorkspaceNav } from "./useWorkspaceNav";

/** 回前台的对账去抖：切标签页、点一下窗口会连着来好几个事件，合成一次 */
const DEBOUNCE_MS = 1000;

/**
 * 磁盘文库的外部改动检测：用 Obsidian / Finder 改过的文件，回到 xedit 就该看到新内容。
 * File System Access API 没有变更通知，只能在回到前台时跟磁盘对一次账
 * （rescan 已是可重入安全的，这里再压一层去抖，少扫几遍）。
 */
export function useVaultWatch({ enabled, nav }: { enabled: boolean; nav: WorkspaceNav }) {
  // 对账在事件回调里执行（必然晚于本次渲染的 effect），effect 里同步 ref 足够新鲜
  const navRef = useRef(nav);
  useEffect(() => {
    navRef.current = nav;
  }, [nav]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let disposed = false;

    const run = async () => {
      if (running) return; // 上一轮还没完：它扫到的已经是最新的磁盘状态
      running = true;
      try {
        const result = await rescanVault();
        if (disposed || !result) return;
        forgetMissingAttachments();
        const { changed, removed } = result;
        if (changed.length || removed.length || result.added.length) notifyDocsChanged();
        const openId = useStore.getState().docId;
        if (!openId) return;
        if (removed.includes(openId)) {
          navRef.current.setReadingId(null);
          toast("文件已在外部删除", "error");
          return;
        }
        if (changed.includes(openId)) applyExternalChange(openId);
      } finally {
        running = false;
      }
    };

    const schedule = () => {
      if (timer) return; // 已经排上了：多个事件合成这一次
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, DEBOUNCE_MS);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", schedule);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", schedule);
    };
  }, [enabled]);
}

/**
 * 当前打开的这篇在磁盘上变了：没有未保存改动就换成磁盘版本，有就只提示、不动用户的编辑。
 * 注意 rescan 按 mtime 判定，可能把我们自己刚落盘的写入也算进 changed，
 * 所以先比内容——与 store 一致就是这种误报，什么都不用做。
 */
function applyExternalChange(id: string) {
  const fresh = getLocalDocContent(id);
  if (fresh === null) return; // 又没了，下一轮对账再说
  const meta = listLocalDocs().find((d) => d.id === id);
  const s = useStore.getState();
  if (fresh === s.content) {
    if (meta && meta.title !== s.title) s.setTitle(meta.title); // 只改了文件名
    return;
  }
  if (hasPendingContent(id, s.content)) {
    toast("文件在外部被修改，已保留你当前的编辑");
    return;
  }
  const title = meta?.title ?? s.title;
  const category = meta?.category ?? UNCATEGORIZED;
  rememberSavedDocument({ docId: id, title, content: fresh, category });
  s.setDoc({ id, title, content: fresh });
  s.setCategory(category);
  // 编辑器持有自己的 CodeMirror 文档，光改 store 不会更新，得让它重挂载一次
  notifyDocReplaced(id);
}
