"use client";

// Shared helpers for the image library. They all touch browser APIs (clipboard) or are called directly by client components,
// so they live here on their own, sparing views from importing back into the lightbox component file

import { toast } from "../Toast";
import type { Asset } from "./types";

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export const isVideo = (asset: Asset) => asset.mime.startsWith("video/");

/** Callers pass doneMsg already translated as a full sentence via t(): concatenating 「链接」 + 「已复制」 gets the word order wrong in English */
export function copyText(text: string, doneMsg: string) {
  void navigator.clipboard.writeText(text).then(() => toast(doneMsg, "success"));
}
