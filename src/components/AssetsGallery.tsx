"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
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
  Play,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { VIDEO_EXT } from "@/lib/media";
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

/** 引用该素材的文章（/api/assets/[id]/usage） */
interface UsageDoc {
  id: string;
  title: string;
  category: string;
  updatedAt: string;
  deletedAt: string | null;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const isVideo = (asset: Asset) => asset.mime.startsWith("video/");

const PAGE_SIZE = 24;

interface AssetPage {
  items: Asset[];
  total: number;
  nextCursor: string | null;
}

async function fetchPage(cursor?: string | null): Promise<AssetPage | null> {
  const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) qs.set("cursor", cursor);
  const res = await fetch(`/api/assets?${qs}`);
  if (!res.ok) return null;
  return res.json();
}

/** 已加载的列表在组件卸载后留在模块里，切回图片库先用它即时渲染，再后台校验 */
let galleryCache: { assets: Asset[]; total: number; nextCursor: string | null } | null = null;

/** 缩略图：加载完成前透明，避免图片逐张「啪」地拍上来 */
function Thumb({ asset }: { asset: Asset }) {
  const [loaded, setLoaded] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.url}
      alt={asset.key}
      loading="lazy"
      className={`w-full transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      ref={(el) => {
        if (el?.complete) setLoaded(true);
      }}
      onLoad={() => setLoaded(true)}
    />
  );
}

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
  const [assets, setAssets] = useState<Asset[] | null>(galleryCache?.assets ?? null);
  const [total, setTotal] = useState(galleryCache?.total ?? 0);
  const [nextCursor, setNextCursor] = useState(galleryCache?.nextCursor ?? null);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  // 每个素材的引用文章缓存；undefined = 尚未查过
  const [usage, setUsage] = useState<Record<string, UsageDoc[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 列数跟随断点（保持旧 columns-2/sm:3/xl:4 的档位）。
  // 分列用固定的「序号 % 列数」轮转而不是 CSS columns：追加下一页时已有图片不换列不跳动，
  // 且顺序是横向的——最新的图排第一行，而不是全部竖着堆在左列
  const [colCount, setColCount] = useState(2);
  useEffect(() => {
    const queries = [
      window.matchMedia("(min-width: 1280px)"),
      window.matchMedia("(min-width: 640px)"),
    ];
    const update = () => setColCount(queries[0].matches ? 4 : queries[1].matches ? 3 : 2);
    update();
    queries.forEach((q) => q.addEventListener("change", update));
    return () => queries.forEach((q) => q.removeEventListener("change", update));
  }, []);

  // 状态一变就回写模块缓存，下次进来直接有图
  useEffect(() => {
    if (assets !== null) galleryCache = { assets, total, nextCursor };
  }, [assets, total, nextCursor]);

  /** 回到第一页重新拉（上传 / 同步之后新文件排最前） */
  const refresh = useCallback(async () => {
    const page = await fetchPage().catch(() => null);
    if (!page) {
      setAssets((prev) => prev ?? []);
      return;
    }
    setAssets(page.items);
    setTotal(page.total);
    setNextCursor(page.nextCursor);
  }, []);

  // 挂载：有缓存就静默校验首页（头部没变则原样保留已加载的列表），没缓存才现拉
  useEffect(() => {
    const cached = galleryCache;
    let cancelled = false;
    void fetchPage()
      .then((page) => {
        if (cancelled) return;
        if (!page) {
          if (!cached) setAssets([]);
          return;
        }
        const sameHead =
          cached &&
          cached.assets.length >= page.items.length &&
          page.items.every((it, i) => cached.assets[i]?.id === it.id);
        if (sameHead) {
          setTotal(page.total);
          return;
        }
        setAssets(page.items);
        setTotal(page.total);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (!cancelled && !cached) setAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !nextCursor) return;
    loadingMoreRef.current = true;
    try {
      const page = await fetchPage(nextCursor).catch(() => null);
      if (!page) return;
      setAssets((prev) => {
        const seen = new Set((prev ?? []).map((a) => a.id));
        return [...(prev ?? []), ...page.items.filter((a) => !seen.has(a.id))];
      });
      setTotal(page.total);
      setNextCursor(page.nextCursor);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [nextCursor]);

  // 滚动哨兵：离底部还有一段距离就预取下一页
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" }
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [nextCursor, loadMore]);

  // 大图里按 → 快翻到已加载的末尾时，提前把下一页补上
  useEffect(() => {
    if (lightbox !== null && assets && lightbox >= assets.length - 2 && nextCursor) {
      void loadMore();
    }
  }, [lightbox, assets, nextCursor, loadMore]);

  // 打开大图时反查这个素材被哪些文章引用（查过的走缓存）
  useEffect(() => {
    if (lightbox === null) return;
    const asset = assets?.[lightbox];
    if (!asset || usage[asset.id]) return;
    let cancelled = false;
    void fetch(`/api/assets/${asset.id}/usage`)
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((d) => {
        if (!cancelled) setUsage((prev) => ({ ...prev, [asset.id]: d.docs ?? [] }));
      })
      .catch(() => {
        if (!cancelled) setUsage((prev) => ({ ...prev, [asset.id]: [] }));
      });
    return () => {
      cancelled = true;
    };
  }, [lightbox, assets, usage]);

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

  const copyText = (text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(() => toast(`${label}已复制`, "success"));
  };

  const removeAsset = async (asset: Asset) => {
    const ok = await askConfirm({
      title: "删除文件",
      message: "同时会从 OSS 删除该文件；引用了它的文章会显示失效。",
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
    if (res.ok) {
      setAssets((prev) => prev?.filter((a) => a.id !== asset.id) ?? null);
      setTotal((t) => Math.max(0, t - 1));
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
          {assets === null ? "加载中…" : `共 ${total} 个文件`}
        </p>
        <span className="flex-1" />
        {isAdmin ? (
          <button
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 text-[13px] text-[var(--ink)] hover:bg-[var(--paper)] disabled:opacity-60"
            onClick={() => void syncHistory()}
            disabled={syncing || !ossConfigured}
            title="把 OSS 里已有但未入库的图片补录进来（仅管理员）"
          >
            {syncing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            同步 OSS 历史
          </button>
        ) : null}
        <button
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 text-[13px] font-medium text-[var(--accent-fg)] shadow-[0_1px_4px_rgba(0,0,0,0.18)] hover:bg-[var(--accent-deep)] disabled:opacity-60"
          onClick={() => fileInputRef.current?.click()}
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
            还没有素材。在编辑器里粘贴图片或视频，
            <br />
            {isAdmin ? "或点「同步 OSS 历史」把已有文件找回来" : "或点右上角「上传」添加"}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-start gap-3">
            {Array.from({ length: colCount }, (_, col) => (
              <div key={col} className="flex min-w-0 flex-1 flex-col gap-3">
                {assets.map((asset, i) =>
                  i % colCount === col ? (
                    <div
                      key={asset.id}
                      className="group relative cursor-zoom-in overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.25)]"
                      onClick={() => setLightbox(i)}
                    >
                      {isVideo(asset) ? (
                        <div className="relative">
                          <video
                            src={asset.url}
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full"
                          />
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <span className="rounded-full bg-black/45 p-2.5 text-white">
                              <Play size={16} fill="currentColor" />
                            </span>
                          </span>
                        </div>
                      ) : (
                        <Thumb asset={asset} />
                      )}
                      {/* 悬停信息层 */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/70 to-black/0 px-3 pb-2 pt-8 transition-transform group-hover:translate-y-0 [@media(hover:none)]:translate-y-0">
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
                  ) : null
                )}
              </div>
            ))}
          </div>
          {nextCursor ? (
            <div
              ref={sentinelRef}
              className="flex items-center justify-center gap-2 py-8 text-[12px] text-[var(--ink-faint)]"
            >
              <Loader2 size={13} className="animate-spin" /> 加载更多…
            </div>
          ) : null}
        </>
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
              {formatSize(assets[lightbox].size)} · {lightbox + 1}/{total}
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
            {isVideo(assets[lightbox]) ? (
              <video
                src={assets[lightbox].url}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={assets[lightbox].url}
                alt=""
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            )}
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
          {/* 引用反查：这个素材出现在哪些文章里 */}
          <div className="shrink-0 px-6 pb-5" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const docs = usage[assets[lightbox].id];
              if (!docs) {
                return <p className="text-center text-[12px] text-white/40">正在查询引用…</p>;
              }
              if (docs.length === 0) {
                return <p className="text-center text-[12px] text-white/40">未被任何文章引用</p>;
              }
              return (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="text-[12px] text-white/50">用于 {docs.length} 篇文章：</span>
                  {docs.map((d) =>
                    d.deletedAt ? (
                      <span
                        key={d.id}
                        className="flex max-w-[240px] items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/50"
                        title="在回收站中"
                      >
                        <FileText size={11} className="shrink-0" />
                        <span className="truncate">{d.title}</span>
                        <span className="shrink-0 text-white/40">回收站</span>
                      </span>
                    ) : onOpenDoc ? (
                      <button
                        key={d.id}
                        className="flex max-w-[240px] cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/85 transition-colors hover:bg-white/25 hover:text-white"
                        title={`打开「${d.title}」`}
                        onClick={() => {
                          setLightbox(null);
                          onOpenDoc(d.id);
                        }}
                      >
                        <FileText size={11} className="shrink-0" />
                        <span className="truncate">{d.title}</span>
                      </button>
                    ) : (
                      <a
                        key={d.id}
                        href={`/?doc=${d.id}`}
                        className="flex max-w-[240px] items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/85 transition-colors hover:bg-white/25 hover:text-white"
                        title={`打开「${d.title}」`}
                      >
                        <FileText size={11} className="shrink-0" />
                        <span className="truncate">{d.title}</span>
                      </a>
                    )
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
