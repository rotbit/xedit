"use client";

import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import type { Asset } from "./types";
import { formatSize, isVideo } from "./utils";
import { useT } from "@/i18n/useT";

/** Image library grid: column-based masonry, click to select, double-click for the lightbox */

/** Thumbnail: transparent until loaded so images don't "pop" in one by one; also measures dimensions for older images */
function Thumb({
  asset,
  onMeasured,
}: {
  asset: Asset;
  onMeasured: (id: string, width: number, height: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  /** For older images with no recorded dimensions, backfill the intrinsic size decoded by the browser */
  const report = (el: HTMLImageElement) => {
    if (asset.width == null && el.naturalWidth > 0) {
      onMeasured(asset.id, el.naturalWidth, el.naturalHeight);
    }
  };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.url}
      alt={asset.key}
      loading="lazy"
      className={`w-full transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      ref={(el) => {
        // A browser cache hit doesn't fire onLoad, so handle it once here
        if (el?.complete) {
          setLoaded(true);
          report(el);
        }
      }}
      onLoad={(e) => {
        setLoaded(true);
        report(e.currentTarget);
      }}
    />
  );
}

/** Card second line: images show pixel dimensions; unmeasured images and videos show file size */
function metaLine(asset: Asset): string {
  if (!isVideo(asset) && asset.width && asset.height) {
    return `${asset.width} × ${asset.height}`;
  }
  return formatSize(asset.size);
}

export function AssetsGrid({
  assets,
  colCount,
  selectedId,
  onSelect,
  onOpen,
  onMeasured,
  hasMore,
  sentinelRef,
}: {
  assets: Asset[];
  colCount: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Double-click opens the lightbox: passes the index within assets */
  onOpen: (index: number) => void;
  onMeasured: (id: string, width: number, height: number) => void;
  hasMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useT();
  return (
    <>
      {/* Columns use a fixed "index % columns" rotation instead of CSS columns: appending the next page doesn't shift existing images between columns,
          and the order runs horizontally — the newest images fill the first row instead of all stacking down the left column */}
      <div className="flex items-start gap-3">
        {Array.from({ length: colCount }, (_, col) => (
          <div key={col} className="flex min-w-0 flex-1 flex-col gap-4">
            {assets.map((asset, i) =>
              i % colCount === col ? (
                <div
                  key={asset.id}
                  className="cursor-pointer"
                  onClick={() => onSelect(asset.id)}
                  onDoubleClick={() => onOpen(i)}
                >
                  <div
                    className={`overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.25)] ${
                      selectedId === asset.id ? "ring-2 ring-[var(--accent)]" : ""
                    }`}
                  >
                    {isVideo(asset) ? (
                      <div className="relative">
                        <video src={asset.url} muted playsInline preload="metadata" className="w-full" />
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <span className="rounded-full bg-black/45 p-2.5 text-white">
                            <Play size={16} fill="currentColor" />
                          </span>
                        </span>
                      </div>
                    ) : (
                      <Thumb asset={asset} onMeasured={onMeasured} />
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-[12px] text-[var(--ink-soft)]">
                    {asset.key.split("/").pop()}
                  </p>
                  <p className="text-[11px] text-[var(--ink-faint)]">{metaLine(asset)}</p>
                </div>
              ) : null
            )}
          </div>
        ))}
      </div>
      {hasMore ? (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center gap-2 py-8 text-[12px] text-[var(--ink-faint)]"
        >
          <Loader2 size={14} className="animate-spin" /> {t("加载更多…")}
        </div>
      ) : null}
    </>
  );
}
