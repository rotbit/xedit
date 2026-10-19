"use client";

import { useRef } from "react";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import { VIDEO_EXT } from "@/lib/media";
import type { AssetFilter } from "./useAssetsFeed";
import { tk } from "@/i18n/t";
import { useT } from "@/i18n/useT";

/** Image library top bar: segmented filter + count + zoom slider + sync/upload */

const FILTERS: [AssetFilter, string][] = [
  ["all", tk("全部")],
  ["image", tk("图片")],
  ["video", tk("视频")],
  ["unused", tk("未引用")],
];

/** The top bar holds neither filters nor column count; AssetsGallery passes them in and receives changes via callbacks, keeping state consistent after refresh. */
export function AssetsToolbar({
  filter,
  onFilterChange,
  total,
  loading,
  cols,
  onColsChange,
  isAdmin,
  ossConfigured,
  syncing,
  uploading,
  onSync,
  onUpload,
}: {
  filter: AssetFilter;
  onFilterChange: (filter: AssetFilter) => void;
  total: number;
  loading: boolean;
  cols: number;
  onColsChange: (cols: number) => void;
  /** 「同步 OSS 历史」 (Sync OSS history) claims every orphaned file in the bucket, so the API is admin-only */
  isAdmin: boolean;
  ossConfigured: boolean;
  syncing: boolean;
  uploading: boolean;
  onSync: () => void;
  onUpload: (files: FileList | null) => void;
}) {
  // Hidden file input: browsers only open the file picker from a real user gesture, so the button's click is forwarded to it
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--hairline)] px-4 py-2.5 sm:px-6">
      {/* Segmented control */}
      <div className="flex items-center gap-0.5 rounded-lg border border-[var(--hairline)] bg-[var(--paper)] p-0.5">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            className={`h-7 cursor-pointer rounded-md px-2.5 text-[12.5px] transition-colors ${
              filter === value
                ? "bg-[var(--panel)] font-medium text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
            }`}
            onClick={() => onFilterChange(value)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-[var(--ink-faint)]">
        {loading ? t("加载中…") : t("共 {n} 个文件", { n: total })}
      </p>

      {/* Spacer between the count and the right-hand buttons */}
      <div className="flex-1" />

      {/* Zoom slider: controls column count; further right means more columns and smaller images */}
      <div className="hidden items-center sm:flex" title={t("缩略图大小（越往右列数越多）")}>
        <input
          type="range"
          min={3}
          max={8}
          step={1}
          value={cols}
          className="h-1 w-[84px] cursor-pointer accent-[var(--accent)]"
          onChange={(e) => onColsChange(Number(e.target.value))}
          aria-label={t("缩略图大小")}
        />
      </div>

      {isAdmin ? (
        <button
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-2.5 text-[12.5px] text-[var(--ink)] hover:bg-[var(--paper)] disabled:opacity-60"
          onClick={onSync}
          disabled={syncing || !ossConfigured}
          title={t("把 OSS 里已有但未入库的图片补录进来（仅管理员）")}
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {t("同步 OSS 历史")}
        </button>
      ) : null}
      <button
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 text-[12.5px] font-medium text-[var(--accent-fg)] shadow-[0_1px_4px_rgba(0,0,0,0.18)] hover:bg-[var(--accent-deep)] disabled:opacity-60"
        onClick={() => fileInputRef.current?.click()}
        // Without object storage configured there's nowhere to put files, so disable the button rather than let the upload fail afterwards
        disabled={uploading || !ossConfigured}
      >
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {t("上传")}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={`image/*,${Object.keys(VIDEO_EXT).join(",")}`}
        multiple
        className="hidden"
        onChange={(e) => {
          onUpload(e.target.files);
          // Clear value afterwards: otherwise picking the same file again won't fire change, and the user thinks the button is broken
          e.target.value = "";
        }}
      />
    </div>
  );
}
