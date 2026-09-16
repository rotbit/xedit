import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type TurndownService from "turndown";
import { handleMediaFiles, type Notify } from "@/lib/editor/commands";

// 富文本粘贴 → Markdown。turndown 不小且只有粘贴用得到，不进编辑器主包：
// 编辑器挂载后异步预载，粘贴时同步取用；加载完成前粘贴则退化为纯文本粘贴。
let turndown: TurndownService | null = null;
let turndownLoading: Promise<void> | null = null;
export function preloadClipboardConverter(): Promise<void> {
  if (!turndownLoading) {
    turndownLoading = Promise.all([import("turndown"), import("turndown-plugin-gfm")]).then(
      ([{ default: Turndown }, { gfm }]) => {
        const td = new Turndown({
          headingStyle: "atx",
          codeBlockStyle: "fenced",
          bulletListMarker: "-",
          emDelimiter: "*",
        });
        td.use(gfm);
        turndown = td;
      }
    );
  }
  return turndownLoading;
}
function htmlToMd(html: string): string {
  if (!turndown) return "";
  try {
    return turndown.turndown(html);
  } catch {
    return "";
  }
}

/** 粘贴与拖放只转换输入内容；默认文本输入继续交给 CodeMirror。
 *  notify：粘贴/拖入媒体会走上传，提示由调用方给（见 commands.ts 的 Notify）。 */
export const editorClipboard = (notify: Notify): Extension =>
  EditorView.domEventHandlers({
    paste: (event, view) => {
      const files = event.clipboardData?.files;
      if (files && files.length > 0 && handleMediaFiles(view, files, notify)) {
        event.preventDefault();
        return true;
      }
      const plain = event.clipboardData?.getData("text/plain") ?? "";
      const sel = view.state.selection.main;
      // 选中文字时粘贴 URL → 自动变链接
      if (/^https?:\/\/\S+$/.test(plain.trim()) && sel.from !== sel.to) {
        const text = view.state.sliceDoc(sel.from, sel.to);
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: `[${text}](${plain.trim()})` },
        });
        event.preventDefault();
        return true;
      }
      // 富文本 → Markdown（纯文本粘贴可用 Cmd+Shift+V）
      const html = event.clipboardData?.getData("text/html") ?? "";
      if (html) {
        const md = htmlToMd(html).trim();
        const norm = (t: string) => t.replace(/\s+/g, " ").trim();
        if (md && norm(md) !== norm(plain)) {
          view.dispatch(view.state.replaceSelection(md));
          event.preventDefault();
          return true;
        }
      }
      return false;
    },
    drop: (event, view) => {
      const files = event.dataTransfer?.files;
      if (files && files.length > 0 && handleMediaFiles(view, files, notify)) {
        event.preventDefault();
        return true;
      }
      return false;
    },
  });
