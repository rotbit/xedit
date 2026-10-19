"use client";

// Annotation quote area: text anchors show an excerpt of the original, media anchors show a thumbnail/type label (moved out of SharedArticle)

import { isVideoUrl } from "@/lib/media";
import type { AnchorType } from "../types";

/** Quote area: text anchors show an excerpt of the original, media anchors show a thumbnail/type label */
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
