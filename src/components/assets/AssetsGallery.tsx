"use client";

/**
 * Orchestration layer for the image library page: toolbar / grid / detail panel / lightbox live in their own files, paging and search live in useAssetsFeed;
 * this only handles the cross-component bits — which asset is selected, which one the lightbox is on, which documents reference an asset.
 * Assets all live in the cloud (OSS + /api/assets); only a column-count preference is stored locally, so switching devices just loses that.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { Images, Loader2 } from "lucide-react";
import { readLocal, writeLocal } from "@/features/workspace/lib/storage";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { toast } from "../Toast";
import { askConfirm } from "../PromptDialog";
import { AssetsLightbox } from "../AssetsLightbox";
import type { Asset, UsageDoc } from "./types";
import { AssetInspector } from "./AssetInspector";
import { AssetsGrid } from "./AssetsGrid";
import { AssetsToolbar } from "./AssetsToolbar";
import { useAssetsFeed } from "./useAssetsFeed";
import { tk } from "@/i18n/t";
import { useT } from "@/i18n/useT";

/** Image library: full-width two-pane view with grid on the left and detail panel on the right; double-click opens the lightbox */

const COLS_KEY = "xedit-assets-cols";
// 3–8 and the slider min / max in AssetsToolbar are two separately hard-coded values; change both when changing the range
const COLS_MIN = 3;
const COLS_MAX = 8;
const COLS_DEFAULT = 5;

const clampCols = (n: number) =>
  Number.isFinite(n) ? Math.min(COLS_MAX, Math.max(COLS_MIN, Math.round(n))) : COLS_DEFAULT;

/**
 * Narrow screens are fixed at two columns: the slider is hidden at this width, and a stored 5–8 columns is unreadably dense on a phone.
 * Subscribing to matchMedia via useSyncExternalStore avoids a "sync setState inside an effect".
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

/** Image library main view: when ossConfigured is false the server can't store new files, so the page degrades to browsing existing records */
export function AssetsGallery({
  ossConfigured,
  onOpenDoc,
}: {
  ossConfigured: boolean;
  /** Open a referencing document: the workspace passes nav.openDoc to switch views in place; defaults to /?doc=<id> */
  onOpenDoc?: (id: string) => void;
}) {
  // 「同步 OSS 历史」 (Sync OSS history) claims every orphaned file in the bucket, so the API is admin-only and so is the button
  const isAdmin = useSession().data?.user?.isAdmin === true;
  const feed = useAssetsFeed();
  const t = useT();
  const { assets, measure, loadMore, refresh, dropLocal, hasMore } = feed;

  // When nothing is stored readLocal returns null and Number(null) is 0, which clampCols clamps to COLS_MIN; COLS_DEFAULT only applies during SSR or when a non-number was stored
  const [colCount, setColCount] = useState(() =>
    typeof window === "undefined" ? COLS_DEFAULT : clampCols(Number(readLocal(COLS_KEY)))
  );
  const gridCols = useNarrow() ? 2 : colCount;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Per-asset cache of referencing documents; undefined = not checked yet
  const [usage, setUsage] = useState<Record<string, UsageDoc[]>>({});

  // After the filter/search changes, the selected asset may no longer be in the list, so the detail panel collapses (no extra state reset needed)
  const selected = assets?.find((a) => a.id === selectedId) ?? null;

  const changeCols = (n: number) => {
    const cols = clampCols(n);
    setColCount(cols);
    writeLocal(COLS_KEY, String(cols));
  };

  // When → in the lightbox reaches the end of what's loaded, prefetch the next page
  useEffect(() => {
    if (lightbox !== null && assets && lightbox >= assets.length - 2 && hasMore) {
      void loadMore();
    }
  }, [lightbox, assets, hasMore, loadMore]);

  // On select (or opening the lightbox) look up which documents reference this asset; cached lookups are reused
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
  // Having usage in the deps makes setUsage re-trigger this effect, but the cache-hit check at the top stops it, so it won't loop
  }, [targetId, usage]);

  // While the detail panel is open: ←/→ change selection, Esc collapses it. The lightbox has its own keyboard handling, so yield while it's open
  useEffect(() => {
    if (!selectedId || lightbox !== null) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Don't steal keys while typing in the search box
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
      if (!res.ok) throw new Error(data.error ?? tk("同步失败"));
      toast(data.added > 0 ? t("已同步 {n} 张历史图片", { n: data.added }) : t("没有新的历史图片"), "success");
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? t(e.message) : t("同步失败"), "error");
    } finally {
      setSyncing(false);
    }
  };

  // Upload sequentially instead of Promise.all: a failed file only reports its own error, the rest keep going, then one summary by success count
  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        await uploadMediaFile(file);
        ok += 1;
      } catch (e) {
        toast(e instanceof Error ? t(e.message) : t("「{name}」上传失败", { name: file.name }), "error");
      }
    }
    if (ok > 0) {
      toast(t("已上传 {n} 个文件", { n: ok }), "success");
      await refresh();
    }
    setUploading(false);
  };

  const removeAsset = useCallback(
    async (asset: Asset) => {
      const ok = await askConfirm({
        title: t("删除文件"),
        message: t("同时会从 OSS 删除该文件；引用了它的文章会显示失效。"),
        confirmText: t("删除"),
        danger: true,
      });
      if (!ok) return;
      const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast(t("删除失败"), "error");
        return;
      }
      // After deleting, just drop this item from the local list: refresh would go back to page one and replace everything, losing loaded pages and scroll position
      dropLocal(asset.id);
      // The deleted asset isn't necessarily the one in the detail panel (you can delete from the lightbox too), so only collapse when it is
      setSelectedId((prev) => (prev === asset.id ? null : prev));
      setLightbox(null);
      toast(t("已删除"), "success");
    },
    [dropLocal, t]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AssetsToolbar
        filter={feed.filter}
        onFilterChange={feed.setFilter}
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
              {t("服务端未配置阿里云 OSS，图片库仅可浏览已有记录")}
            </p>
          ) : null}

          {assets === null ? (
            <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-[var(--ink-faint)]">
              <Loader2 size={16} className="animate-spin" /> {t("加载中…")}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--hairline-strong)] py-20">
              <Images size={24} className="text-[var(--ink-faint)]" />
              <p className="text-center text-[13px] leading-6 text-[var(--ink-faint)]">
                {feed.isDefaultView ? (
                  <>
                    {t("还没有素材。在编辑器里粘贴图片或视频，")}
                    <br />
                    {isAdmin ? t("或点「同步 OSS 历史」把已有文件找回来") : t("或点右上角「上传」添加")}
                  </>
                ) : (
                  t("没有符合条件的文件")
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

      {/* Lightbox */}
      {lightbox !== null && assets && assets[lightbox] ? (
        <AssetsLightbox
          assets={assets}
          index={lightbox}
          total={feed.total}
          usage={usage}
          onClose={() => setLightbox(null)}
          onNavigate={(i) => {
            setLightbox(i);
            // The detail panel follows lightbox paging, so after closing it the right side shows the same asset
            setSelectedId(assets[i]?.id ?? null);
          }}
          onDelete={(a) => void removeAsset(a)}
          onOpenDoc={onOpenDoc}
        />
      ) : null}
    </div>
  );
}
