// Single entry point for editor formatting commands: shared by shortcuts, the floating toolbar, the insert menu, and the slash menu.

import { EditorView } from "@codemirror/view";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { extractVideoPoster } from "@/lib/videoPoster";
import { VIDEO_EXT, altFromFileName, isVideoMime } from "@/lib/media";
import { getActiveVault } from "@/lib/localBackend/vaultSession";
import type { VaultBackend } from "@/lib/localBackend/vaultBackend";
import { reserveUploadSlots } from "@/lib/editor/uploadPlaceholder";
import { t } from "@/i18n/t";
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
  tableTemplate,
} from "@/lib/editor/format";

/** Message kinds, matching Toast's three levels (only semantics are declared here, with no knowledge of the UI) */
export type NoticeKind = "success" | "error" | "info";
/**
 * All messages from the command layer go back to the caller through this callback.
 * lib doesn't import components: how messages are shown is up to the editor component (currently toast).
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

// Server/upload messages are Chinese dictionary keys: translate on a hit, pass through otherwise
const errText = (e: unknown, fallback: string) => (e instanceof Error ? t(e.message) : fallback);

async function uploadMedia(file: File, notify: Notify): Promise<string | null> {
  try {
    return await uploadMediaFile(file);
  } catch (e) {
    // Include the file name: when pasting several at once, just "upload failed" doesn't tell the user which one failed
    notify(t("「{name}」{error}", { name: file.name, error: errText(e, t("上传失败")) }), "error");
    return null;
  }
}

/** Upload a video and produce the Markdown to insert: the video and poster frame upload in parallel, poster goes in the title slot (poster= convention) */
async function videoMarkdown(file: File, notify: Notify): Promise<string | null> {
  const [url, posterUrl] = await Promise.all([
    uploadMedia(file, notify),
    extractVideoPoster(file).then((poster) => (poster ? uploadMedia(poster, notify) : null)),
  ]);
  if (!url) return null;
  const posterPart = posterUrl ? ` "poster=${posterUrl}"` : "";
  return `\n![${altFromFileName(file.name)}](${url}${posterPart})\n`;
}

/** Spaces and parentheses in file names would break Markdown links, so escape them char by char (decoded back when reading attachments) */
const encodeMdPath = (rel: string): string =>
  rel.replace(/[ ()<>]/g, (c) => encodeURIComponent(c));

/**
 * One image → a src that can go in the document: with a disk library, save to <vault>/attachments/ and keep only the relative path
 * (no cloud upload, so the same vault opened in Obsidian still shows it); upload to the cloud only without a library.
 * Body images and covers (CoverPicker upload / AI generation) follow the same rule, so it's shared here.
 * Failures throw an Error with the reason; the caller decides how to show it.
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
    return `\n![${altFromFileName(file.name)}](${await saveImageSrc(file, vault)})\n`;
  } catch (e) {
    notify(t("「{name}」{error}", { name: file.name, error: errText(e, t("存入文库失败")) }), "error");
    return null;
  }
}

/** One file → Markdown to insert (on failure, shows its own message and returns null, never throws:
 *  it runs on the insertion queue, and one reject would mean later files never get their turn) */
function mediaMarkdown(
  file: File,
  vault: VaultBackend | null,
  notify: Notify
): Promise<string | null> {
  // Videos can only go to the cloud (local relative paths in the body can't reach WeChat); images stay local when possible
  if (isVideoMime(file.type)) return videoMarkdown(file, notify);
  if (vault) return vaultImageMarkdown(vault, file, notify);
  return uploadMedia(file, notify).then((url) =>
    url ? `\n![${altFromFileName(file.name)}](${url})\n` : null
  );
}

/**
 * Single entry point for media coming in via paste/drop/file picker.
 * at: insertion position. Drops pass the mouse position; otherwise omitted = current cursor.
 *
 * The insertion point is reserved right away with a placeholder pill (see uploadPlaceholder.ts), so editing during upload doesn't misplace it.
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
    notify(t("「{name}」格式不支持，视频请用 mp4 / webm / mov", { name: f.name }), "error");
  }
  // Mixed images and videos keep the user's file order rather than being split into two groups
  const media = all.filter((f) => f.type.startsWith("image/") || isVideoMime(f.type));
  if (media.length === 0) return unsupported.length > 0;

  const vault = getActiveVault();
  const pos = at ?? view.state.selection.main.head;
  const slots = reserveUploadSlots(
    view,
    pos,
    media.map((f) => f.name || t("未命名文件"))
  );
  // No toasts for progress or success: the placeholder pill spins right at the insertion point and turns into the image in place; a toast would just cover the text

  // Uploads run in parallel, insertions wait in series: item i+1 goes only after item i is inserted,
  // so order in the body always matches the user's file selection order, regardless of which upload finishes first
  let queue = Promise.resolve();
  media.forEach((file, i) => {
    const uploading = mediaMarkdown(file, vault, notify);
    queue = queue
      .then(() => uploading)
      .then((markdown) => {
        if (!markdown) return slots[i].cancel();
        if (!slots[i].resolve(markdown))
          notify(t("「{name}」的插入位置已被删掉，没有插入", { name: file.name }), "info");
      })
      .catch(() => slots[i].cancel());
  });
  return true;
}

/**
 * notify: the video command starts an upload, and upload messages are shown through it.
 * arg: the color value for the color command (omitted = clear color); ignored by other commands.
 */
export function runFormatCommand(
  view: EditorView,
  cmd: FormatCommand,
  notify: Notify,
  arg?: string
) {
  switch (cmd) {
    case "bold":
      return toggleInlineFormat(view, "**", t("加粗文字"));
    case "italic":
      return toggleInlineFormat(view, "*", t("斜体文字"));
    case "strike":
      return toggleInlineFormat(view, "~~", t("删除线"));
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
      return insertBlock(view, `![${t("图片描述")}](https://)`);
    case "video": {
      // Open the file picker to upload directly, smoother than making the user type a video URL
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
      return insertBlock(view, tableTemplate());
    case "hr":
      return insertBlock(view, "---");
  }
}
