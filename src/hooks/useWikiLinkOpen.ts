"use client";

import { useEffect, useRef } from "react";
import { askConfirm } from "@/components/PromptDialog";
import { t } from "@/i18n/t";
import { normalizeTitle, WIKI_OPEN_EVENT } from "@/lib/wikiLink";
import type { DocMeta } from "@/features/workspace/types";

interface WikiLinkOpenParams {
  /** Article list for resolving targets (excluding trash) */
  docs: DocMeta[];
  /** Current article's category: a newly created target inherits it, so a group of linked articles stays together */
  category: string;
  openDoc: (id: string) => void;
  createDoc: (category: string, init: { title: string }) => void | Promise<void>;
}

/**
 * Handles clicks on `[[wiki links]]` in the editor / preview: find the article by title, or ask whether to create it if not found.
 * The render layers (CodeMirror decorations, preview HTML) don't know about the library; they only dispatch events, and resolution happens here.
 */
export function useWikiLinkOpen(params: WikiLinkOpenParams) {
  // docs and callbacks are new references every render, so keep the latest values in refs:
  // the listener is attached once instead of being removed and re-added on window with every keystroke
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
      // Target doesn't exist yet: Obsidian just creates an empty note; here we ask first --
      // one mis-clicked link creating a new article out of nowhere is more disruptive for "articles" than for "notes"
      void askConfirm({
        title: t("文章不存在"),
        message: t("文章「{title}」还不存在，是否新建并打开？", { title: target }),
        confirmText: t("新建"),
      }).then((ok) => {
        if (ok) void createDoc(category, { title: target });
      });
    };
    window.addEventListener(WIKI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(WIKI_OPEN_EVENT, onOpen);
  }, []);
}
