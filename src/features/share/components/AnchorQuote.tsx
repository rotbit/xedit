"use client";

// 批注引用区：文字锚点截取原文，媒体锚点显示缩略图/类型标签（从 SharedArticle 搬出）

import { isVideoUrl } from "@/lib/media";
import type { AnchorType } from "../types";

/** 引用区：文字锚点截取原文，媒体锚点显示缩略图/类型标签 */
export function AnchorQuote({ anchorType, anchorText }: { anchorType: AnchorType; anchorText: string }) {
  if (anchorType === "media") {
    const video = isVideoUrl(anchorText);
    return (
      <span className="flex min-w-0 items-center gap-1.5 border-l-2 border-amber-400 pl-2 text-[12px] text-[var(--ink-faint)]">
      {video ? null : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={anchorText} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
      )}
      {video ? "视频" : "图片"}
      </span>
    );
  }
  return (
    <span className="min-w-0 flex-1 truncate border-l-2 border-amber-400 pl-2 text-[12px] text-[var(--ink-faint)]">
      {anchorText}
    </span>
  );
}
