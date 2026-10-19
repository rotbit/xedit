"use client";

import { useCallback, useEffect, useRef } from "react";
import { askConfirm } from "@/components/PromptDialog";
import { toast } from "@/components/Toast";
import { t } from "@/i18n/t";
import { notifyDocsChanged } from "@/lib/localDocs";
import {
  applyRenameLinks,
  findLinkingDocs,
  isLinkableTitle,
} from "@/lib/renameLinks";
import { normalizeTitle } from "@/lib/wikiLink";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import type { DocMeta } from "@/features/workspace/types";

interface Params {
  docId: string;
  /** All articles (excluding trash); undefined until loaded */
  docs?: DocMeta[];
  /** Current title (live value from the store) */
  title: string;
  /** A change means a different doc / a reload, so the remembered old title must be discarded */
  docVersion: number;
  /**
   * Refreshes the library after editing other docs' bodies. Defaults to broadcasting DOCS_CHANGED -- writes to the local library and cloud mirror
   * already broadcast it; useDocLibrary listens and rereads the list, and once the new updatedAt arrives
   * the docIndex cache key is invalidated, so the sidebar and search catch up on their own.
   */
  refresh?: () => void;
}

/**
 * After a title change, updates `[[wiki links]]` in other articles that point to it (like Obsidian's rename link updates).
 *
 * Triggered on the title input's focus / blur rather than every keystroke: titles are typed character by character,
 * and scanning the whole library and prompting for every intermediate state would drive people mad. Remember the original on focus,
 * take the final title on blur; whatever was typed in between doesn't count.
 *
 * How this doc's own title gets saved isn't handled here (the autosave pipeline already does that);
 * this only handles "what other docs call it".
 */
export function useRenameLinks({ docId, docs, title, docVersion, refresh }: Params) {
  /** The title exactly as it was on focus (including the 「未命名文章」 (Untitled) placeholder); null means the title isn't being edited */
  const beforeEditRef = useRef<string | null>(null);
  /** Only one confirm dialog at a time: a second askConfirm call replaces the first, leaving the earlier Promise hanging forever */
  const busyRef = useRef(false);

  // Discard the memory when the doc changes (or this doc is replaced by a newer cloud version), so A's old title isn't attributed to B
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
          title: t("更新双向链接"),
          message: t("有 {n} 篇文章链接到「{old}」，一并改成「{new}」？", {
            n: targets.length,
            old: oldTitle,
            new: newTitle,
          }),
          confirmText: t("一并更新"),
        });
        if (!ok) return;
        const { updated, failed } = await applyRenameLinks(targets, oldTitle, newTitle);
        (refresh ?? notifyDocsChanged)();
        if (updated > 0) toast(t("已更新 {n} 篇文章的链接", { n: updated }), "success");
        if (failed > 0) toast(t("{n} 篇文章的链接更新失败", { n: failed }), "error");
      } finally {
        busyRef.current = false;
      }
    },
    [docs, docId, refresh]
  );

  /** Title input focused: remember the original. Must be called before the caller clears the 「未命名文章」 (Untitled) placeholder */
  const onTitleFocus = useCallback(() => {
    if (busyRef.current) return;
    beforeEditRef.current = title;
  }, [title]);

  /** Title input blurred: this edit's final title is in, so update the references here */
  const onTitleBlur = useCallback(() => {
    const before = beforeEditRef.current;
    beforeEditRef.current = null;
    if (before === null || busyRef.current) return;

    const oldTitle = before.trim();
    const newTitle = title.trim();
    // No previous title (new draft, placeholder) means nothing can link to it; an empty new title gets the placeholder back from the caller, so that's not a rename either
    if (!oldTitle || oldTitle === UNTITLED_DOC) return;
    if (!newTitle || newTitle === UNTITLED_DOC) return;
    if (normalizeTitle(oldTitle) === normalizeTitle(newTitle)) return;
    // A title with brackets / pipes written into `[[…]]` would break the link syntax itself, so leave it alone
    if (!isLinkableTitle(newTitle)) return;
    void run(oldTitle, newTitle);
  }, [title, run]);

  return { onTitleFocus, onTitleBlur };
}
