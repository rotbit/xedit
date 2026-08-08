"use client";

// 文章视图顶栏右侧的操作簇：功能簇 / 分享 / 一键复制 / 双屏 / 阅读模式 / 更多。
// 由 ArticleReader portal 到面包屑顶栏，与面包屑共用一行（从 ArticleReader 搬出）。

import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Columns2,
  Copy,
  Loader2,
  MoreHorizontal,
  Share2,
  Trash2,
} from "lucide-react";
import { buildWechatHtml } from "@/lib/copy/wechat";
import { buildZhihuHtml } from "@/lib/copy/zhihu";
import { copyRichHtml } from "@/lib/copy/clipboard";
import { toast } from "@/components/Toast";
import { buildRenderOptions } from "@/features/editor/lib/renderOptions";
import { useStore } from "@/store/useStore";
import { EditorTools } from "./EditorTools";

const iconBtn =
  "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors";
const iconBtnIdle = `${iconBtn} text-[var(--ink-soft)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]`;
const iconBtnOn = `${iconBtn} bg-[var(--accent-wash)] text-[var(--accent)]`;
const menuItem =
  "flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]";
const menuCard =
  "absolute right-0 top-[calc(100%+6px)] z-20 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]";

export function ReaderActions({
  chars,
  split,
  onToggleSplit,
  reading,
  onToggleReading,
  onOpenVersions,
  onOpenShare,
  onDelete,
}: {
  chars: number;
  split: boolean;
  onToggleSplit: () => void;
  reading: boolean;
  onToggleReading: () => void;
  onOpenVersions: () => void;
  onOpenShare: () => void;
  onDelete?: () => void;
}) {
  const [copying, setCopying] = useState<"wechat" | "zhihu" | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  /** 直接复制到公众号，与编辑页的复制管线一致 */
  const copyWechat = async () => {
    if (copying) return;
    setCopying("wechat");
    try {
      const s = useStore.getState();
      const html = await buildWechatHtml(s.content, await buildRenderOptions());
      await copyRichHtml(html, s.content);
      toast("已复制！打开公众号后台编辑器直接粘贴", "success");
    } catch (e) {
      toast(`复制失败：${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setCopying(null);
    }
  };

  const copyZhihu = async () => {
    if (copying) return;
    setCopying("zhihu");
    try {
      const s = useStore.getState();
      await copyRichHtml(await buildZhihuHtml(s.content), s.content);
      toast("已复制！打开知乎编辑器直接粘贴", "success");
    } catch (e) {
      toast(`复制失败：${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setCopying(null);
    }
  };

  return (
    <>
      {/* 排版主题 / 设置 / AI / 版本 / 导出 —— 从老编辑页搬来的功能簇 */}
      <EditorTools onOpenVersions={onOpenVersions} />
      <span className="mx-1 h-5 w-px shrink-0 bg-[var(--hairline)]" />
      {/* 分享：公开链接（永久）+ 访客批注 */}
      <button
        className={iconBtnIdle}
        title="分享给他人查看与批注"
        onClick={onOpenShare}
      >
        <Share2 size={15} />
      </button>
      {/* 一键复制：点开选择平台（纯图标） */}
      <div className="relative">
        <button
          className="flex h-8 cursor-pointer items-center gap-0.5 rounded-lg pl-2 pr-1.5 text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-45"
          onClick={() => setCopyMenuOpen((v) => !v)}
          disabled={chars === 0 || copying !== null}
          title="一键复制"
        >
          {copying !== null ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Copy size={15} />
          )}
          <ChevronDown size={13} className="opacity-70" />
        </button>
        {copyMenuOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setCopyMenuOpen(false)} />
            <div className={`${menuCard} w-40`}>
              <button
                className={menuItem}
                onClick={() => {
                  setCopyMenuOpen(false);
                  void copyWechat();
                }}
              >
                复制到公众号
              </button>
              <button
                className={menuItem}
                onClick={() => {
                  setCopyMenuOpen(false);
                  void copyZhihu();
                }}
              >
                复制到知乎
              </button>
            </div>
          </>
        ) : null}
      </div>
      {/* 阅读模式：整块编辑区换成渲染后的成品，宽栏通读 */}
      <button
        className={reading ? iconBtnOn : iconBtnIdle}
        title="阅读模式：全屏只看渲染后的成品（⌘⇧E）"
        onClick={onToggleReading}
      >
        <BookOpen size={15} />
      </button>
      <button
        className={split ? iconBtnOn : iconBtnIdle}
        title="双屏：左源码、右公众号真实效果（⌘E）"
        onClick={onToggleSplit}
      >
        <Columns2 size={15} />
      </button>
      <div className="relative">
        <button
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--panel)] hover:text-[var(--ink)]"
          title="更多操作"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className={`${menuCard} w-44`}>
              {onDelete ? (
                <button
                  className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                >
                  <Trash2 size={13} />
                  删除文章
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
