/**
 * Vault attachments: images and other binaries all go to <vault>/attachments/, with only relative paths in the body
 * ("attachments/xxx.png"), so the same library still renders when opened in Obsidian.
 * Reads produce object URLs for <img>, created once per path and cached for the session.
 */

import {
  ATTACHMENTS_DIR,
  baseName,
  getDirectory,
  parentPath,
  sanitizeFileName,
  writeBlobFile,
} from "./vaultFs";
import { t } from "@/i18n/t";

export interface AttachmentOps {
  /** Write an image or other binary into attachments/; returns the path relative to the vault root */
  saveAttachment(file: Blob, suggestedName: string): Promise<string>;
  /** Read an attachment as an object URL (cached, created once per path); null if missing */
  getAttachmentUrl(relPath: string): Promise<string | null>;
  /** Clear the cache after a rescan: attachments on disk may have been replaced externally.
   *  No revokeObjectURL here: an <img> may still be showing that URL and would break instantly */
  clearUrls(): void;
}

export function createAttachments(root: FileSystemDirectoryHandle): AttachmentOps {
  const urls = new Map<string, string>();

  return {
    async saveAttachment(file: Blob, suggestedName: string): Promise<string> {
      const base = sanitizeFileName(stripExt(baseName(suggestedName)));
      const name = `${base}-${randomSuffix()}${pickExt(suggestedName, file.type)}`;
      const dir = await getDirectory(root, ATTACHMENTS_DIR, true);
      if (!dir) throw new Error(t("建不出目录 {path}", { path: ATTACHMENTS_DIR }));
      // Deliberately bypasses the write queue: the caller must wait until the file is on disk before inserting the link
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

/** Try the path as-is first, then URL-decoded: links in the body may be %20-escaped */
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
    return null; // Invalid escape, and the raw path wasn't found either, so it doesn't exist
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

/** Extension comes from the filename, else guessed from MIME, else PNG (clipboard images are almost always PNG) */
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

/** 6-hex-digit random suffix so images with the same name don't overwrite each other */
function randomSuffix(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
}
