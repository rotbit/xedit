// 编辑器的格式化命令总表：浮动工具条、+ 菜单、斜杠菜单三处入口都收敛到这里。
// 从 MarkdownEditor 搬出（语义未变），一是给 MarkdownEditor 腾出 500 行的余量，
// 二是斜杠菜单要在 CodeMirror 扩展层直接执行命令，不能反过来依赖 React 组件。

import { EditorView } from "@codemirror/view";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { extractVideoPoster } from "@/lib/videoPoster";
import { VIDEO_EXT, isVideoMime } from "@/lib/media";
import {
  wrapSelection,
  applyColor,
  prefixLines,
  toggleTaskLines,
  insertBlock,
  TABLE_TEMPLATE,
} from "@/lib/editorFormat";
import { toast } from "@/components/Toast";

export type FormatCommand =
  | "bold"
  | "italic"
  | "strike"
  | "color"
  | "h1"
  | "h2"
  | "h3"
  | "quote"
  | "tasklist"
  | "code"
  | "codeblock"
  | "link"
  | "image"
  | "video"
  | "table"
  | "hr";

async function uploadMedia(file: File): Promise<string | null> {
  try {
    return await uploadMediaFile(file);
  } catch (e) {
    toast(e instanceof Error ? e.message : "上传失败", "error");
    return null;
  }
}

function insertAtCursor(view: EditorView, text: string) {
  const pos = view.state.selection.main.head;
  view.dispatch({ changes: { from: pos, insert: text } });
}

/** 上传视频并插入：正片与封面帧并行上传，封面写进 title 位（poster= 约定） */
async function uploadVideoAndInsert(view: EditorView, file: File) {
  const [url, posterUrl] = await Promise.all([
    uploadMedia(file),
    extractVideoPoster(file).then((poster) => (poster ? uploadMedia(poster) : null)),
  ]);
  if (!url) return;
  const name = file.name.replace(/\.[^.]+$/, "");
  const posterPart = posterUrl ? ` "poster=${posterUrl}"` : "";
  insertAtCursor(view, `\n![${name}](${url}${posterPart})\n`);
  toast("视频已插入", "success");
}

export function handleMediaFiles(view: EditorView, files: FileList | File[]): boolean {
  const all = Array.from(files);
  const images = all.filter((f) => f.type.startsWith("image/"));
  const videos = all.filter((f) => isVideoMime(f.type));
  const unsupported = all.filter((f) => f.type.startsWith("video/") && !isVideoMime(f.type));
  for (const f of unsupported) {
    toast(`「${f.name}」格式不支持，视频请用 mp4 / webm / mov`, "error");
  }
  if (images.length === 0 && videos.length === 0) return unsupported.length > 0;

  if (images.length > 0) toast("图片上传中…");
  for (const file of images) {
    void uploadMedia(file).then((url) => {
      if (!url) return;
      const name = file.name.replace(/\.[^.]+$/, "");
      insertAtCursor(view, `\n![${name}](${url})\n`);
      toast("图片已插入", "success");
    });
  }
  if (videos.length > 0) toast("视频上传中，大文件可能要一会儿…");
  for (const file of videos) {
    void uploadVideoAndInsert(view, file);
  }
  return true;
}

/** arg：color 命令的色值（缺省 = 清除颜色），其余命令忽略 */
export function runFormatCommand(view: EditorView, cmd: FormatCommand, arg?: string) {
  switch (cmd) {
    case "bold":
      return wrapSelection(view, "**", "**", "加粗文字");
    case "italic":
      return wrapSelection(view, "*", "*", "斜体文字");
    case "strike":
      return wrapSelection(view, "~~", "~~", "删除线");
    case "color":
      return applyColor(view, arg ?? null);
    case "code":
      return wrapSelection(view, "`", "`", "code");
    case "h1":
      return prefixLines(view, "# ");
    case "h2":
      return prefixLines(view, "## ");
    case "h3":
      return prefixLines(view, "### ");
    case "quote":
      return prefixLines(view, "> ");
    case "tasklist":
      return toggleTaskLines(view);
    case "codeblock":
      return insertBlock(view, "```javascript\nconst hello = 'world';\n```");
    case "link":
      return wrapSelection(view, "[", "](https://)", "链接文字");
    case "image":
      return insertBlock(view, "![图片描述](https://)");
    case "video": {
      // 直接拉起文件选择上传，比让用户手填视频 URL 更顺手
      const input = document.createElement("input");
      input.type = "file";
      input.accept = Object.keys(VIDEO_EXT).join(",");
      input.onchange = () => {
        if (input.files?.length) handleMediaFiles(view, input.files);
      };
      input.click();
      return;
    }
    case "table":
      return insertBlock(view, TABLE_TEMPLATE);
    case "hr":
      return insertBlock(view, "---");
  }
}
