"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Upload,
  RefreshCw,
  Trash2,
  Link2,
  Code2,
  X,
  Images,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "./Toast";
import { askConfirm } from "./PromptDialog";

interface Asset {
  id: string;
  key: string;
  url: string;
  size: number;
  mime: string;
  source: string;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function AssetsGallery({ ossConfigured }: { ossConfigured: boolean }) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/assets");
    if (res.ok) setAssets(await res.json());
    else setAssets([]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/assets")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (!cancelled) setAssets(list);
      })
      .catch(() => {
        if (!cancelled) setAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 键盘导航大图
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowLeft") setLightbox((i) => (i !== null && i > 0 ? i - 1 : i));
      if (e.key === "ArrowRight")
        setLightbox((i) => (i !== null && assets && i < assets.length - 1 ? i + 1 : i));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, assets]);

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
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) ok += 1;
      else {
        const data = await res.json().catch(() => ({}));
        toast(data.error ?? `「${file.name}」上传失败`, "error");
      }
    }
    if (ok > 0) {
      toast(`已上传 ${ok} 张图片`, "success");
      await refresh();
    }
    setUploading(false);
  };

  const copyText = (text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(() => toast(`${label}已复制`, "success"));
  };

  const removeAsset = async (asset: Asset) => {
    const ok = await askConfirm({
      title: "删除图片",
      message: "同时会从 OSS 删除该文件；引用了这张图的文章会显示裂图。",
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
    if (res.ok) {
      setAssets((prev) => prev?.filter((a) => a.id !== asset.id) ?? null);
      setLightbox(null);
      toast("已删除", "success");
    } else {
      toast("删除失败", "error");
    }
  };

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex items-center gap-3">
        <p className="text-[13px] text-[var(--ink-faint)]">
          {assets === null ? "加载中…" : `共 ${assets.length} 张图片`}
        </p>
        <span className="flex-1" />
        <button
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] bg-white px-3 text-[13px] text-[var(--ink)] hover:bg-[var(--paper)] disabled:opacity-60"
          onClick={() => void syncHistory()}
          disabled={syncing || !ossConfigured}
          title="把 OSS 里已有但未入库的图片补录进来"
        >
          {syncing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          同步 OSS 历史
        </button>
        <button
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(192,57,43,0.35)] hover:bg-[var(--accent-deep)] disabled:opacity-60"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !ossConfigured}
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          上传图片
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {!ossConfigured ? (
        <p className="mt-3 rounded-lg bg-[var(--accent-wash)]/60 px-4 py-2.5 text-[12.5px] text-[var(--accent-deep)]">
          服务端未配置阿里云 OSS，图片库仅可浏览已有记录
        </p>
      ) : null}

      {/* 瀑布流 */}
      {assets === null ? (
        <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-[var(--ink-faint)]">
          <Loader2 size={16} className="animate-spin" /> 加载中…
        </div>
      ) : assets.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--hairline-strong)] py-20">
          <Images size={26} className="text-[var(--ink-faint)]" />
          <p className="text-[13px] leading-6 text-[var(--ink-faint)] text-center">
            还没有图片。在编辑器里粘贴图片、AI 生成配图，
            <br />
            或点「同步 OSS 历史」把已有图片找回来
          </p>
        </div>
      ) : (
        <div className="mt-4 columns-2 gap-3 sm:columns-3 xl:columns-4 [&>*]:mb-3">
          {assets.map((asset, i) => (
            <div
              key={asset.id}
              className="group relative cursor-zoom-in overflow-hidden rounded-lg border border-[var(--hairline)] bg-white shadow-[0_1px_3px_rgba(60,50,30,0.05)] transition-shadow hover:shadow-[0_10px_30px_-8px_rgba(60,45,20,0.25)]"
              onClick={() => setLightbox(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.url} alt={asset.key} loading="lazy" className="w-full" />
              {/* 悬停信息层 */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/70 to-black/0 px-3 pb-2 pt-8 transition-transform group-hover:translate-y-0">
                <div className="pointer-events-auto flex items-center gap-1">
                  {asset.source === "ai" ? (
                    <span className="flex items-center gap-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white">
                      <Sparkles size={9} />
                      AI
                    </span>
                  ) : null}
                  <span className="text-[11px] text-white/85">{formatSize(asset.size)}</span>
                  <span className="flex-1" />
                  <button
                    className="cursor-pointer rounded p-1.5 text-white/80 hover:bg-white/20 hover:text-white"
                    title="复制链接"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyText(asset.url, "链接");
                    }}
                  >
                    <Link2 size={13} />
                  </button>
                  <button
                    className="cursor-pointer rounded p-1.5 text-white/80 hover:bg-white/20 hover:text-white"
                    title="复制 Markdown"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyText(`![](${asset.url})`, "Markdown ");
                    }}
                  >
                    <Code2 size={13} />
                  </button>
                  <button
                    className="cursor-pointer rounded p-1.5 text-white/80 hover:bg-red-500/70 hover:text-white"
                    title="删除"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeAsset(asset);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 大图预览 */}
      {lightbox !== null && assets && assets[lightbox] ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <div className="flex h-14 shrink-0 items-center gap-2 px-5" onClick={(e) => e.stopPropagation()}>
            <span className="truncate text-[12.5px] text-white/70">
              {assets[lightbox].key.split("/").pop()}
            </span>
            <span className="text-[11.5px] text-white/40">
              {formatSize(assets[lightbox].size)} · {lightbox + 1}/{assets.length}
            </span>
            <span className="flex-1" />
            <button
              className="cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] text-white/80 hover:bg-white/15"
              onClick={() => copyText(assets[lightbox].url, "链接")}
            >
              复制链接
            </button>
            <button
              className="cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] text-white/80 hover:bg-white/15"
              onClick={() => copyText(`![](${assets[lightbox].url})`, "Markdown ")}
            >
              复制 Markdown
            </button>
            <button
              className="cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] text-red-300 hover:bg-red-500/30"
              onClick={() => void removeAsset(assets[lightbox])}
            >
              删除
            </button>
            <button
              className="cursor-pointer rounded-md p-2 text-white/80 hover:bg-white/15"
              onClick={() => setLightbox(null)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-8">
            {lightbox > 0 ? (
              <button
                className="absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2.5 text-white/80 hover:bg-white/25"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox(lightbox - 1);
                }}
              >
                <ChevronLeft size={18} />
              </button>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assets[lightbox].url}
              alt=""
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            {lightbox < assets.length - 1 ? (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2.5 text-white/80 hover:bg-white/25"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox(lightbox + 1);
                }}
              >
                <ChevronRight size={18} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
