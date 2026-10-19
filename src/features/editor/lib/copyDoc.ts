import { useStore } from "@/store/useStore";
import { buildWechatHtml } from "@/lib/copy/wechat";
import { buildZhihuHtml } from "@/lib/copy/zhihu";
import { copyRichHtml } from "@/lib/copy/clipboard";
import { toast } from "@/components/Toast";
import { t, tk } from "@/i18n/t";
import { buildRenderOptions } from "./renderOptions";

export type CopyTarget = "wechat" | "zhihu";

const DONE: Record<CopyTarget, string> = {
  wechat: tk("已复制！打开公众号后台编辑器直接粘贴"),
  zhihu: tk("已复制！打开知乎编辑器直接粘贴"),
};

/**
 * Copy the full text as rich text using the current typography theme.
 * Both the top bar's copy menu (ReaderActions) and the command palette call this, so there's a single implementation;
 * the "copying" button state belongs to the menu's own UI and stays in ReaderActions.
 */
export async function copyDoc(target: CopyTarget): Promise<void> {
  try {
    const s = useStore.getState();
    // Zhihu ignores custom themes (it re-lays out pasted content), so no render options are needed
    const html =
      target === "wechat"
        ? await buildWechatHtml(s.content, await buildRenderOptions())
        : await buildZhihuHtml(s.content);
    await copyRichHtml(html, s.content);
    toast(t(DONE[target]), "success");
  } catch (e) {
    toast(t("复制失败：{error}", { error: e instanceof Error ? e.message : String(e) }), "error");
  }
}
