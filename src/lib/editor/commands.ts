// 编辑器格式命令的统一入口：快捷键、浮动工具条、插入菜单和斜杠菜单共用。

import { EditorView } from "@codemirror/view";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { extractVideoPoster } from "@/lib/videoPoster";
import { VIDEO_EXT, isVideoMime, stripExt } from "@/lib/media";
import { getActiveVault } from "@/lib/localBackend/vaultSession";
import type { VaultBackend } from "@/lib/localBackend/vaultBackend";
import {
  wrapSelection,
  toggleInlineFormat,
  applyColor,
  prefixLines,
  toggleHeading,
  toggleTaskLines,
  insertBlock,
  insertCallout,
  insertCodeBlock,
  TABLE_TEMPLATE,
} from "@/lib/editor/format";

/** 提示的种类，与 Toast 的三档一致（这里只声明语义，不认识具体 UI） */
export type NoticeKind = "success" | "error" | "info";
/**
 * 命令层要弹的提示统统经这个回调交回调用方。
 * lib 不 import components：提示怎么呈现由编辑器组件决定（现在传的是 toast）。
 */
export type Notify = (message: string, kind?: NoticeKind) => void;

export type FormatCommand =
  | "bold"
  | "italic"
  | "strike"
  | "color"
  | "h1"
  | "h2"
  | "h3"
  | "quote"
  | "callout"
  | "tasklist"
  | "code"
  | "codeblock"
  | "link"
  | "image"
  | "video"
  | "table"
  | "hr";

async function uploadMedia(file: File, notify: Notify): Promise<string | null> {
  try {
    return await uploadMediaFile(file);
  } catch (e) {
    notify(e instanceof Error ? e.message : "上传失败", "error");
    return null;
  }
}

function insertAtCursor(view: EditorView, text: string) {
  const pos = view.state.selection.main.head;
  view.dispatch({ changes: { from: pos, insert: text } });
}

/** 上传视频并插入：正片与封面帧并行上传，封面写进 title 位（poster= 约定） */
async function uploadVideoAndInsert(view: EditorView, file: File, notify: Notify) {
  const [url, posterUrl] = await Promise.all([
    uploadMedia(file, notify),
    extractVideoPoster(file).then((poster) => (poster ? uploadMedia(poster, notify) : null)),
  ]);
  if (!url) return;
  const name = stripExt(file.name);
  const posterPart = posterUrl ? ` "poster=${posterUrl}"` : "";
  insertAtCursor(view, `\n![${name}](${url}${posterPart})\n`);
  notify("视频已插入", "success");
}

/** 文件名里的空格和括号会把 Markdown 链接截断，逐字转义（读附件时会 decode 回去） */
const encodeMdPath = (rel: string): string =>
  rel.replace(/[ ()<>]/g, (c) => encodeURIComponent(c));

/** 有磁盘文库时图片落 <vault>/attachments/，正文里只留相对路径：
 *  不传云端，同一个库用 Obsidian 打开也显示得出来 */
async function saveImageToVault(
  view: EditorView,
  vault: VaultBackend,
  file: File,
  notify: Notify
) {
  try {
    const rel = await vault.saveAttachment(file, file.name || "image.png");
    const name = stripExt(file.name);
    insertAtCursor(view, `\n![${name}](${encodeMdPath(rel)})\n`);
    notify("图片已存入文库 attachments/", "success");
  } catch (e) {
    notify(e instanceof Error ? e.message : "图片存入文库失败", "error");
  }
}

export function handleMediaFiles(
  view: EditorView,
  files: FileList | File[],
  notify: Notify
): boolean {
  const all = Array.from(files);
  const images = all.filter((f) => f.type.startsWith("image/"));
  const videos = all.filter((f) => isVideoMime(f.type));
  const unsupported = all.filter((f) => f.type.startsWith("video/") && !isVideoMime(f.type));
  for (const f of unsupported) {
    notify(`「${f.name}」格式不支持，视频请用 mp4 / webm / mov`, "error");
  }
  if (images.length === 0 && videos.length === 0) return unsupported.length > 0;

  // 视频仍然只能上传云端（正文里的本地相对路径进不了公众号），图片能落本地就落本地
  const vault = getActiveVault();
  if (images.length > 0 && !vault) notify("图片上传中…");
  for (const file of images) {
    if (vault) {
      void saveImageToVault(view, vault, file, notify);
      continue;
    }
    void uploadMedia(file, notify).then((url) => {
      if (!url) return;
      const name = stripExt(file.name);
      insertAtCursor(view, `\n![${name}](${url})\n`);
      notify("图片已插入", "success");
    });
  }
  if (videos.length > 0) notify("视频上传中，大文件可能要一会儿…");
  for (const file of videos) {
    void uploadVideoAndInsert(view, file, notify);
  }
  return true;
}

/**
 * notify：video 命令会拉起上传，上传过程中的提示由它弹出。
 * arg：color 命令的色值（缺省 = 清除颜色），其余命令忽略。
 */
export function runFormatCommand(
  view: EditorView,
  cmd: FormatCommand,
  notify: Notify,
  arg?: string
) {
  switch (cmd) {
    case "bold":
      return toggleInlineFormat(view, "**", "加粗文字");
    case "italic":
      return toggleInlineFormat(view, "*", "斜体文字");
    case "strike":
      return toggleInlineFormat(view, "~~", "删除线");
    case "color":
      return applyColor(view, arg ?? null);
    case "code":
      return toggleInlineFormat(view, "`", "code");
    case "h1":
      return toggleHeading(view, 1);
    case "h2":
      return toggleHeading(view, 2);
    case "h3":
      return toggleHeading(view, 3);
    case "quote":
      return prefixLines(view, "> ");
    case "callout":
      return insertCallout(view);
    case "tasklist":
      return toggleTaskLines(view);
    case "codeblock":
      return insertCodeBlock(view);
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
        if (input.files?.length) handleMediaFiles(view, input.files, notify);
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
