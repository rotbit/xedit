"use client";

import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import type { Asset } from "./types";
import { formatSize, isVideo } from "./utils";

/** 图片库网格：分列瀑布流，单击选中、双击开大图 */

/** 缩略图：加载完成前透明，避免图片逐张「啪」地拍上来；顺手把历史图片的尺寸量出来 */
function Thumb({
  asset,
  onMeasured,
}: {
  asset: Asset;
  onMeasured: (id: string, width: number, height: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  /** 入库时没记尺寸的老图片，用浏览器解码出来的固有尺寸回填 */
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
        // 命中浏览器缓存时不会触发 onLoad，这里补一次
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

/** 卡片第二行：图片优先显示像素尺寸，没量到尺寸的和视频一律显示体积 */
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
  /** 双击开大图：传的是在 assets 里的下标 */
  onOpen: (index: number) => void;
  onMeasured: (id: string, width: number, height: number) => void;
  hasMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {/* 分列用固定的「序号 % 列数」轮转而不是 CSS columns：追加下一页时已有图片不换列不跳动，
          且顺序是横向的——最新的图排第一行，而不是全部竖着堆在左列 */}
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
          <Loader2 size={14} className="animate-spin" /> 加载更多…
        </div>
      ) : null}
    </>
  );
}
