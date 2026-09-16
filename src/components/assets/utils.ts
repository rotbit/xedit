"use client";

// 图片库的共享小工具。都要碰浏览器 API（剪贴板）或被客户端组件直接调用，
// 所以单独放一处，免得各视图反向 import 大图预览层那个组件文件

import { toast } from "../Toast";
import type { Asset } from "./types";

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export const isVideo = (asset: Asset) => asset.mime.startsWith("video/");

export function copyText(text: string, label: string) {
  void navigator.clipboard.writeText(text).then(() => toast(`${label}已复制`, "success"));
}
