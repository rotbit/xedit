"use client";

import { useRef } from "react";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import { VIDEO_EXT } from "@/lib/media";
import type { AssetFilter } from "./useAssetsFeed";

/** 图片库顶栏：分段过滤 + 计数 + 缩放滑杆 + 同步/上传 */

const FILTERS: [AssetFilter, string][] = [
  ["all", "全部"],
  ["image", "图片"],
  ["video", "视频"],
  ["unused", "未引用"],
];

/** 顶栏自己不持有筛选条件和列数，全部由 AssetsGallery 传入、改动回调上去，保证刷新后状态一致。 */
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
  /** 「同步 OSS 历史」会认领整个 bucket 的无主文件，接口只对管理员开放 */
  isAdmin: boolean;
  ossConfigured: boolean;
  syncing: boolean;
  uploading: boolean;
  onSync: () => void;
  onUpload: (files: FileList | null) => void;
}) {
  // 隐藏的 file input：浏览器只在真实用户手势里允许打开文件选择框，所以得由按钮的 click 转发过来
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--hairline)] px-4 py-2.5 sm:px-6">
      {/* 分段控件 */}
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
            {label}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-[var(--ink-faint)]">
        {loading ? "加载中…" : `共 ${total} 个文件`}
      </p>

      {/* 计数与右侧按钮之间留空 */}
      <div className="flex-1" />

      {/* 缩放滑杆：控制列数，越往右列数越多、图越小 */}
      <div className="hidden items-center sm:flex" title="缩略图大小（越往右列数越多）">
        <input
          type="range"
          min={3}
          max={8}
          step={1}
          value={cols}
          className="h-1 w-[84px] cursor-pointer accent-[var(--accent)]"
          onChange={(e) => onColsChange(Number(e.target.value))}
          aria-label="缩略图大小"
        />
      </div>

      {isAdmin ? (
        <button
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-2.5 text-[12.5px] text-[var(--ink)] hover:bg-[var(--paper)] disabled:opacity-60"
          onClick={onSync}
          disabled={syncing || !ossConfigured}
          title="把 OSS 里已有但未入库的图片补录进来（仅管理员）"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          同步 OSS 历史
        </button>
      ) : null}
      <button
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 text-[12.5px] font-medium text-[var(--accent-fg)] shadow-[0_1px_4px_rgba(0,0,0,0.18)] hover:bg-[var(--accent-deep)] disabled:opacity-60"
        onClick={() => fileInputRef.current?.click()}
        // 对象存储没配好就没地方放文件，按钮直接禁用，不要让用户传完才看到失败
        disabled={uploading || !ossConfigured}
      >
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        上传
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={`image/*,${Object.keys(VIDEO_EXT).join(",")}`}
        multiple
        className="hidden"
        onChange={(e) => {
          onUpload(e.target.files);
          // 用完清空 value：否则连着选同一个文件不会再触发 change，用户会以为按钮坏了
          e.target.value = "";
        }}
      />
    </div>
  );
}
