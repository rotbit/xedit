"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import type { Asset, UsageDoc } from "./assets/types";
import { copyText, formatSize, isVideo } from "./assets/utils";
import { useT } from "@/i18n/useT";

/** Image library lightbox: types are in assets/types, helpers in assets/utils, the list itself in assets/AssetsGallery */

/** Image / video lightbox. Arrow keys page, Esc closes; clicking the backdrop closes, so every content block must stop propagation itself. */
export function AssetsLightbox({
  assets,
  index,
  total,
  usage,
  onClose,
  onNavigate,
  onDelete,
  onOpenDoc,
}: {
  assets: Asset[];
  index: number;
  /** Server-side total (larger than assets.length under pagination) */
  total: number;
  /** Per-asset cache of referencing documents; undefined = not checked yet */
  usage: Record<string, UsageDoc[]>;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDelete: (asset: Asset) => void;
  /** Open a referencing document: the workspace passes nav.openDoc to switch views in place; defaults to /?doc=<id> */
  onOpenDoc?: (id: string) => void;
}) {
  // index is owned by the parent and may point out of range after a delete; if nothing's there, render nothing (early return below)
  const asset = assets[index];
  const t = useT();

  useEscape(onClose);

  // Arrow keys page images (Escape closing is left to useEscape, shared with other overlays)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (e.key === "ArrowRight" && index < assets.length - 1) onNavigate(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, assets.length, onNavigate]);

  if (!asset) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* The top bar, image and bottom usage area each stop propagation, otherwise clicks on them get eaten by the backdrop's close handler */}
      <div className="flex h-14 shrink-0 items-center gap-2 px-5" onClick={(e) => e.stopPropagation()}>
        <span className="truncate text-[12.5px] text-white/70">
          {asset.key.split("/").pop()}
        </span>
        <span className="text-[11.5px] text-white/40">
          {/* Use the server total as the denominator: under pagination assets is only what's loaded, and assets.length would make it look like images went missing */}
          {formatSize(asset.size)} · {index + 1}/{total}
        </span>
        <span className="flex-1" />
        <button
          className="cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] text-white/80 hover:bg-white/15"
          onClick={() => copyText(asset.url, t("链接已复制"))}
        >
          {t("复制链接")}
        </button>
        <button
          className="cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] text-white/80 hover:bg-white/15"
          onClick={() => copyText(`![](${asset.url})`, t("Markdown 已复制"))}
        >
          {t("复制 Markdown")}
        </button>
        <button
          className="cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] text-red-300 hover:bg-red-500/30"
          onClick={() => onDelete(asset)}
        >
          {t("删除")}
        </button>
        <button
          className="cursor-pointer rounded-md p-2 text-white/80 hover:bg-white/15"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-8">
        {index > 0 ? (
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2.5 text-white/80 hover:bg-white/25"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(index - 1);
            }}
          >
            <ChevronLeft size={18} />
          </button>
        ) : null}
        {isVideo(asset) ? (
          <video
            src={asset.url}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.url}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {index < assets.length - 1 ? (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2.5 text-white/80 hover:bg-white/25"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(index + 1);
            }}
          >
            <ChevronRight size={18} />
          </button>
        ) : null}
      </div>
      {/* Reverse usage: which documents this asset appears in */}
      <div className="shrink-0 px-6 pb-5" onClick={(e) => e.stopPropagation()}>
        {/* Three-state branch: undefined is loading, empty array is unused, otherwise list them; the IIFE lets this branch chain live inside JSX */}
        {(() => {
          const docs = usage[asset.id];
          if (!docs) {
            return <p className="text-center text-[12px] text-white/40">{t("正在查询引用…")}</p>;
          }
          if (docs.length === 0) {
            return <p className="text-center text-[12px] text-white/40">{t("未被任何文章引用")}</p>;
          }
          return (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-[12px] text-white/50">{t("用于 {n} 篇文章：", { n: docs.length })}</span>
              {docs.map((d) =>
                d.deletedAt ? (
                  <span
                    key={d.id}
                    className="flex max-w-[240px] items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/50"
                    title={t("在回收站中")}
                  >
                    <FileText size={12} className="shrink-0" />
                    <span className="truncate">{d.title}</span>
                    <span className="shrink-0 text-white/40">{t("回收站")}</span>
                  </span>
                ) : onOpenDoc ? (
                  <button
                    key={d.id}
                    className="flex max-w-[240px] cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/85 transition-colors hover:bg-white/25 hover:text-white"
                    title={t("打开「{title}」", { title: d.title })}
                    onClick={() => {
                      // Close the lightbox before jumping to the document: it's a fixed full-screen layer and would cover the newly opened one
                      onClose();
                      onOpenDoc(d.id);
                    }}
                  >
                    <FileText size={12} className="shrink-0" />
                    <span className="truncate">{d.title}</span>
                  </button>
                ) : (
                  <a
                    key={d.id}
                    href={`/?doc=${d.id}`}
                    className="flex max-w-[240px] items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/85 transition-colors hover:bg-white/25 hover:text-white"
                    title={t("打开「{title}」", { title: d.title })}
                  >
                    <FileText size={12} className="shrink-0" />
                    <span className="truncate">{d.title}</span>
                  </a>
                )
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
