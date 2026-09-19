// 编辑器格式命令的统一入口：快捷键、浮动工具条、插入菜单和斜杠菜单共用。

import { EditorView } from "@codemirror/view";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { extractVideoPoster } from "@/lib/videoPoster";
import { VIDEO_EXT, isVideoMime, stripExt } from "@/lib/media";
import { getActiveVault } from "@/lib/localBackend/vaultSession";
import type { VaultBackend } from "@/lib/localBackend/vaultBackend";
import { reserveUploadSlots } from "@/lib/editor/uploadPlaceholder";
import {
  insertLink,
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

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

async function uploadMedia(file: File, notify: Notify): Promise<string | null> {
  try {
    return await uploadMediaFile(file);
  } catch (e) {
    // 带上文件名：一次粘好几张时，光说「上传失败」用户不知道是哪张没成
    notify(`「${file.name}」${errText(e, "上传失败")}`, "error");
    return null;
  }
}

/** 上传视频，产出待插入的 Markdown：正片与封面帧并行上传，封面写进 title 位（poster= 约定） */
async function videoMarkdown(file: File, notify: Notify): Promise<string | null> {
  const [url, posterUrl] = await Promise.all([
    uploadMedia(file, notify),
    extractVideoPoster(file).then((poster) => (poster ? uploadMedia(poster, notify) : null)),
  ]);
  if (!url) return null;
  const posterPart = posterUrl ? ` "poster=${posterUrl}"` : "";
  return `\n![${stripExt(file.name)}](${url}${posterPart})\n`;
}

/** 文件名里的空格和括号会把 Markdown 链接截断，逐字转义（读附件时会 decode 回去） */
const encodeMdPath = (rel: string): string =>
  rel.replace(/[ ()<>]/g, (c) => encodeURIComponent(c));

/**
 * 一张图 → 能写进文档的 src：有磁盘文库就落 <vault>/attachments/ 只留相对路径
 * （不传云端，同一个库用 Obsidian 打开也显示得出来），没有文库才传云端。
 * 正文插图与封面（CoverPicker 的上传 / AI 生成）走的是同一条规则，所以抽在这里共用。
 * 失败抛出带原因的 Error，怎么提示由调用方定。
 */
export async function saveImageSrc(
  file: File,
  vault: VaultBackend | null = getActiveVault()
): Promise<string> {
  if (!vault) return await uploadMediaFile(file);
  return encodeMdPath(await vault.saveAttachment(file, file.name || "image.png"));
}

async function vaultImageMarkdown(
  vault: VaultBackend,
  file: File,
  notify: Notify
): Promise<string | null> {
  try {
    return `\n![${stripExt(file.name)}](${await saveImageSrc(file, vault)})\n`;
  } catch (e) {
    notify(`「${file.name}」${errText(e, "存入文库失败")}`, "error");
    return null;
  }
}

/** 一个文件 → 待插入的 Markdown（失败自己弹提示并返回 null，绝不抛出：
 *  它挂在落笔队列上，一旦 reject 后面的文件就永远轮不到了） */
function mediaMarkdown(
  file: File,
  vault: VaultBackend | null,
  notify: Notify
): Promise<string | null> {
  // 视频只能传云端（正文里的本地相对路径进不了公众号），图片能落本地就落本地
  if (isVideoMime(file.type)) return videoMarkdown(file, notify);
  if (vault) return vaultImageMarkdown(vault, file, notify);
  return uploadMedia(file, notify).then((url) =>
    url ? `\n![${stripExt(file.name)}](${url})\n` : null
  );
}

/**
 * 粘贴/拖入/选文件进来的媒体统一入口。
 * at：落点。拖放传鼠标位置，其余不传＝当前光标处。
 *
 * 落点在此刻就用占位牌子占住（见 uploadPlaceholder.ts），上传期间用户接着编辑也不会插错地方。
 */
export function handleMediaFiles(
  view: EditorView,
  files: FileList | File[],
  notify: Notify,
  at?: number
): boolean {
  const all = Array.from(files);
  const unsupported = all.filter((f) => f.type.startsWith("video/") && !isVideoMime(f.type));
  for (const f of unsupported) {
    notify(`「${f.name}」格式不支持，视频请用 mp4 / webm / mov`, "error");
  }
  // 图片视频混着拖进来也按用户给的文件顺序排，不分两拨
  const media = all.filter((f) => f.type.startsWith("image/") || isVideoMime(f.type));
  if (media.length === 0) return unsupported.length > 0;

  const vault = getActiveVault();
  const pos = at ?? view.state.selection.main.head;
  const slots = reserveUploadSlots(
    view,
    pos,
    media.map((f) => f.name || "未命名文件")
  );
  // 进度与成功都不弹 toast：占位牌子就在落点上转着，传完原地变成图，盖一条提示反而挡正文

  // 上传并行跑，落笔串行等：第 i 个落完才轮到第 i+1 个，
  // 正文里的先后顺序因此恒等于用户选文件的顺序，谁先传完不算数
  let queue = Promise.resolve();
  media.forEach((file, i) => {
    const uploading = mediaMarkdown(file, vault, notify);
    queue = queue
      .then(() => uploading)
      .then((markdown) => {
        if (!markdown) return slots[i].cancel();
        if (!slots[i].resolve(markdown))
          notify(`「${file.name}」的插入位置已被删掉，没有插入`, "info");
      })
      .catch(() => slots[i].cancel());
  });
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
      return insertLink(view);
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
