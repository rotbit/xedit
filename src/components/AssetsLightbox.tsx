"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import type { Asset, UsageDoc } from "./assets/types";
import { copyText, formatSize, isVideo } from "./assets/utils";

/** 图片库的大图预览层：类型见 assets/types，小工具见 assets/utils，列表本体见 assets/AssetsGallery */

/** 大图 / 视频预览层。左右键翻页、Esc 关闭；点背景关闭，所以内容区每一块都得自己拦住冒泡。 */
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
  /** 服务端总数（分页加载下比 assets.length 大） */
  total: number;
  /** 每个素材的引用文章缓存；undefined = 尚未查过 */
  usage: Record<string, UsageDoc[]>;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDelete: (asset: Asset) => void;
  /** 打开引用文章：工作台传 nav.openDoc 就地切换视图；缺省退回 /?doc=<id> */
  onOpenDoc?: (id: string) => void;
}) {
  // index 由上层维护，删掉一张后可能指到越界位置；取不到就整层不渲染（下面的早退）
  const asset = assets[index];

  useEscape(onClose);

  // 左右键翻图（Escape 关闭交给 useEscape，和其它弹层同一份实现）
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
      {/* 顶栏、图片、底部引用区都要单独拦冒泡，否则点到它们会被背景的关闭逻辑吃掉 */}
      <div className="flex h-14 shrink-0 items-center gap-2 px-5" onClick={(e) => e.stopPropagation()}>
        <span className="truncate text-[12.5px] text-white/70">
          {asset.key.split("/").pop()}
        </span>
        <span className="text-[11.5px] text-white/40">
          {/* 分母用服务端总数：分页加载下 assets 只是已拉到的一页，用 assets.length 会让人以为图变少了 */}
          {formatSize(asset.size)} · {index + 1}/{total}
        </span>
        <span className="flex-1" />
        <button
          className="cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] text-white/80 hover:bg-white/15"
          onClick={() => copyText(asset.url, "链接")}
        >
          复制链接
        </button>
        <button
          className="cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] text-white/80 hover:bg-white/15"
          onClick={() => copyText(`![](${asset.url})`, "Markdown ")}
        >
          复制 Markdown
        </button>
        <button
          className="cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] text-red-300 hover:bg-red-500/30"
          onClick={() => onDelete(asset)}
        >
          删除
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
      {/* 引用反查：这个素材出现在哪些文章里 */}
      <div className="shrink-0 px-6 pb-5" onClick={(e) => e.stopPropagation()}>
        {/* 三态分支：undefined 查询中、空数组没人引用、有数据就列出来；用 IIFE 是为了在 JSX 里写这条分支链 */}
        {(() => {
          const docs = usage[asset.id];
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
                      // 先关预览再跳文章：预览层是 fixed 全屏，留着会盖住刚打开的那篇
                      onClose();
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
  );
}
