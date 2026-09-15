/**
 * Vault 的附件：图片等二进制统一写进 <vault>/attachments/，正文里只留相对路径
 * （"attachments/xxx.png"），同一个库用 Obsidian 打开照样显示得出来。
 * 读回来给 <img> 用的是 object URL，同一路径只建一次，缓存在会话里。
 */

import {
  ATTACHMENTS_DIR,
  baseName,
  getDirectory,
  parentPath,
  sanitizeFileName,
  writeBlobFile,
} from "./vaultFs";

export interface AttachmentOps {
  /** 把图片等二进制写进 attachments/，返回相对 vault 根的路径 */
  saveAttachment(file: Blob, suggestedName: string): Promise<string>;
  /** 读附件为 object URL（缓存，同一路径只建一次），不存在返回 null */
  getAttachmentUrl(relPath: string): Promise<string | null>;
  /** 对账后清缓存：磁盘上的附件可能已被外部换掉。
   *  这里不 revokeObjectURL —— 界面上可能正挂着这个 URL 的 <img>，撤了当场变裂图 */
  clearUrls(): void;
}

export function createAttachments(root: FileSystemDirectoryHandle): AttachmentOps {
  const urls = new Map<string, string>();

  return {
    async saveAttachment(file: Blob, suggestedName: string): Promise<string> {
      const base = sanitizeFileName(stripExt(baseName(suggestedName)));
      const name = `${base}-${randomSuffix()}${pickExt(suggestedName, file.type)}`;
      const dir = await getDirectory(root, ATTACHMENTS_DIR, true);
      if (!dir) throw new Error(`建不出目录 ${ATTACHMENTS_DIR}`);
      // 故意不走写队列：调用方要等文件真落了盘，才好往正文里插链接
      await writeBlobFile(dir, name, file);
      return `${ATTACHMENTS_DIR}/${name}`;
    },

    async getAttachmentUrl(relPath: string): Promise<string | null> {
      const rel = relPath.replace(/^\.?\/+/, "");
      if (!rel) return null;
      const hit = urls.get(rel);
      if (hit) return hit;
      const file = await openAttachment(root, rel);
      if (!file) return null;
      const url = URL.createObjectURL(file);
      urls.set(rel, url);
      return url;
    },

    clearUrls() {
      urls.clear();
    },
  };
}

/** 先按原样找，找不到再按 URL 解码找一次：正文里的链接可能是 %20 转义过的 */
async function openAttachment(
  root: FileSystemDirectoryHandle,
  rel: string
): Promise<File | null> {
  const hit = await readFileAt(root, rel);
  if (hit) return hit;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return null; // 不是合法转义，原样都找不到那就是没有
  }
  return decoded === rel ? null : await readFileAt(root, decoded);
}

async function readFileAt(root: FileSystemDirectoryHandle, rel: string): Promise<File | null> {
  const dir = await getDirectory(root, parentPath(rel), false);
  if (!dir) return null;
  try {
    return await (await dir.getFileHandle(baseName(rel))).getFile();
  } catch {
    return null;
  }
}

/** 扩展名以文件名为准，没有就按 MIME 猜，都没有按 PNG 算（剪贴板里的图基本都是 PNG） */
function pickExt(name: string, type: string): string {
  const named = /\.([A-Za-z0-9]{1,8})$/.exec(baseName(name));
  if (named) return `.${named[1].toLowerCase()}`;
  const sub = (type.split("/")[1] ?? "")
    .split("+")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!sub) return ".png";
  return sub === "jpeg" ? ".jpg" : `.${sub}`;
}

const stripExt = (name: string): string => name.replace(/\.[^.]+$/, "");

/** 6 位十六进制随机后缀：同名图片不会互相覆盖 */
function randomSuffix(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
}
