"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { Images, Loader2 } from "lucide-react";
import { readLocal, writeLocal } from "@/features/workspace/lib/storage";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { toast } from "../Toast";
import { askConfirm } from "../PromptDialog";
import { AssetsLightbox, type Asset, type UsageDoc } from "../AssetsLightbox";
import { AssetInspector } from "./AssetInspector";
import { AssetsGrid } from "./AssetsGrid";
import { AssetsToolbar } from "./AssetsToolbar";
import { useAssetsFeed } from "./useAssetsFeed";

/** 图片库：左网格 + 右详情栏的通栏两栏视图，双击开大图 */

const COLS_KEY = "xedit-assets-cols";
const COLS_MIN = 3;
const COLS_MAX = 8;
const COLS_DEFAULT = 5;

const clampCols = (n: number) =>
  Number.isFinite(n) ? Math.min(COLS_MAX, Math.max(COLS_MIN, Math.round(n))) : COLS_DEFAULT;

/**
 * 窄屏固定两列：滑杆在这个宽度下是藏着的，存的 5～8 列到手机上密得没法看。
 * 用 useSyncExternalStore 订阅 matchMedia，省掉「effect 里同步 setState」。
 */
const NARROW = "(max-width: 639px)";
const subscribeNarrow = (cb: () => void) => {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useNarrow = () =>
  useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW).matches,
    () => false
  );

export function AssetsGallery({
  ossConfigured,
  onOpenDoc,
}: {
  ossConfigured: boolean;
  /** 打开引用文章：工作台传 nav.openDoc 就地切换视图；缺省退回 /?doc=<id> */
  onOpenDoc?: (id: string) => void;
}) {
  // 「同步 OSS 历史」会认领整个 bucket 的无主文件，接口只对管理员开放，按钮也只给管理员看
  const isAdmin = useSession().data?.user?.isAdmin === true;
  const feed = useAssetsFeed();
  const { assets, measure, loadMore, refresh, dropLocal, hasMore } = feed;

  const [colCount, setColCount] = useState(() =>
    typeof window === "undefined" ? COLS_DEFAULT : clampCols(Number(readLocal(COLS_KEY)))
  );
  const gridCols = useNarrow() ? 2 : colCount;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  // 每个素材的引用文章缓存；undefined = 尚未查过
  const [usage, setUsage] = useState<Record<string, UsageDoc[]>>({});

  // 过滤/搜索换掉后选中的那张可能已不在列表里，详情栏跟着收起（不必额外清状态）
  const selected = assets?.find((a) => a.id === selectedId) ?? null;

  const changeCols = (n: number) => {
    const cols = clampCols(n);
    setColCount(cols);
    writeLocal(COLS_KEY, String(cols));
  };

  // 大图里按 → 快翻到已加载的末尾时，提前把下一页补上
  useEffect(() => {
    if (lightbox !== null && assets && lightbox >= assets.length - 2 && hasMore) {
      void loadMore();
    }
  }, [lightbox, assets, hasMore, loadMore]);

  // 选中（或开大图）时反查这个素材被哪些文章引用，查过的走缓存
  const targetId = lightbox !== null ? (assets?.[lightbox]?.id ?? null) : selectedId;
  useEffect(() => {
    if (!targetId || usage[targetId]) return;
    let cancelled = false;
    void fetch(`/api/assets/${targetId}/usage`)
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((d) => {
        if (!cancelled) setUsage((prev) => ({ ...prev, [targetId]: d.docs ?? [] }));
      })
      .catch(() => {
        if (!cancelled) setUsage((prev) => ({ ...prev, [targetId]: [] }));
      });
    return () => {
      cancelled = true;
    };
  }, [targetId, usage]);

  // 详情栏打开时：←/→ 换选中，Esc 收起。大图自己有一套键盘，开着就让位
  useEffect(() => {
    if (!selectedId || lightbox !== null) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // 正在搜索框里敲字就不抢键
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const list = assets ?? [];
      const i = list.findIndex((a) => a.id === selectedId);
      const next = e.key === "ArrowLeft" ? i - 1 : i + 1;
      if (i < 0 || next < 0 || next >= list.length) return;
      e.preventDefault();
      setSelectedId(list[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, lightbox, assets]);

  const syncHistory = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/assets", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "同步失败");
      toast(data.added > 0 ? `已同步 ${data.added} 张历史图片` : "没有新的历史图片", "success");
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "同步失败", "error");
    } finally {
      setSyncing(false);
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        await uploadMediaFile(file);
        ok += 1;
      } catch (e) {
        toast(e instanceof Error ? e.message : `「${file.name}」上传失败`, "error");
      }
    }
    if (ok > 0) {
      toast(`已上传 ${ok} 个文件`, "success");
      await refresh();
    }
    setUploading(false);
  };

  const removeAsset = useCallback(
    async (asset: Asset) => {
      const ok = await askConfirm({
        title: "删除文件",
        message: "同时会从 OSS 删除该文件；引用了它的文章会显示失效。",
        confirmText: "删除",
        danger: true,
      });
      if (!ok) return;
      const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast("删除失败", "error");
        return;
      }
      dropLocal(asset.id);
      setSelectedId((prev) => (prev === asset.id ? null : prev));
      setLightbox(null);
      toast("已删除", "success");
    },
    [dropLocal]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AssetsToolbar
        filter={feed.filter}
        onFilterChange={feed.setFilter}
        query={feed.query}
        onQueryChange={feed.setQuery}
        total={feed.total}
        loading={assets === null}
        cols={colCount}
        onColsChange={changeCols}
        isAdmin={isAdmin}
        ossConfigured={ossConfigured}
        syncing={syncing}
        uploading={uploading}
        onSync={() => void syncHistory()}
        onUpload={(files) => void uploadFiles(files)}
      />

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-4 pb-16 pt-4 sm:px-6">
          {!ossConfigured ? (
            <p className="mb-3 rounded-lg bg-[var(--accent-wash)]/60 px-4 py-2.5 text-[12.5px] text-[var(--accent-deep)]">
              服务端未配置阿里云 OSS，图片库仅可浏览已有记录
            </p>
          ) : null}

          {assets === null ? (
            <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-[var(--ink-faint)]">
              <Loader2 size={16} className="animate-spin" /> 加载中…
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--hairline-strong)] py-20">
              <Images size={26} className="text-[var(--ink-faint)]" />
              <p className="text-center text-[13px] leading-6 text-[var(--ink-faint)]">
                {feed.isDefaultView ? (
                  <>
                    还没有素材。在编辑器里粘贴图片或视频，
                    <br />
                    {isAdmin ? "或点「同步 OSS 历史」把已有文件找回来" : "或点右上角「上传」添加"}
                  </>
                ) : (
                  "没有符合条件的文件"
                )}
              </p>
            </div>
          ) : (
            <AssetsGrid
              assets={assets}
              colCount={gridCols}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onOpen={setLightbox}
              onMeasured={measure}
              hasMore={hasMore}
              sentinelRef={feed.sentinelRef}
            />
          )}
        </div>

        {selected ? (
          <AssetInspector
            asset={selected}
            usage={usage[selected.id]}
            onClose={() => setSelectedId(null)}
            onDelete={(a) => void removeAsset(a)}
            onOpenDoc={onOpenDoc}
          />
        ) : null}
      </div>

      {/* 大图预览 */}
      {lightbox !== null && assets && assets[lightbox] ? (
        <AssetsLightbox
          assets={assets}
          index={lightbox}
          total={feed.total}
          usage={usage}
          onClose={() => setLightbox(null)}
          onNavigate={(i) => {
            setLightbox(i);
            // 大图翻页时详情栏跟着走，关掉大图后右边还是同一张
            setSelectedId(assets[i]?.id ?? null);
          }}
          onDelete={(a) => void removeAsset(a)}
          onOpenDoc={onOpenDoc}
        />
      ) : null}
    </div>
  );
}
