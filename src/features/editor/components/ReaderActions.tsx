"use client";

// 文章视图顶栏右侧的操作簇：大纲 / 插入 / 排版主题 / 版本 / 一键复制 / 双屏 / 阅读 / 更多。
// 由 ArticleReader portal 到面包屑顶栏，与面包屑共用一行（从 ArticleReader 搬出）。
// 常驻工具栏改成浮动工具条后，大纲开关与插入类操作没了去处，一并收进这里。
// 低频项（分享 / 导出 / 三个开关 / 删除）统一收进 ⋯ 菜单，顶栏只留常用动作。

import { memo, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Columns2,
  Copy,
  Film,
  History,
  Image as ImageIcon,
  ListTodo,
  ListTree,
  Loader2,
  Minus,
  MoreHorizontal,
  Palette,
  PenLine,
  Plus,
  Share2,
  SquareCode,
  Table,
  Trash2,
} from "lucide-react";
import type { FormatCommand } from "@/lib/editorCommands";
import { buildWechatHtml } from "@/lib/copy/wechat";
import { buildZhihuHtml } from "@/lib/copy/zhihu";
import { copyRichHtml } from "@/lib/copy/clipboard";
import { toast } from "@/components/Toast";
import { Dropdown } from "@/components/Dropdown";
import { ThemePickerPanel } from "@/components/ThemePicker";
import { resolveTheme } from "@/lib/themes";
import { buildRenderOptions } from "@/features/editor/lib/renderOptions";
import { useStore } from "@/store/useStore";
import { ToggleRow } from "./MenuControls";
import { runExport, type ExportKind } from "../lib/exportDoc";

const iconBtn =
  "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors";
const iconBtnIdle = `${iconBtn} text-[var(--ink-soft)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]`;
const iconBtnOn = `${iconBtn} bg-[var(--accent-wash)] text-[var(--accent)]`;
const menuItem =
  "flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]";
const menuCard =
  "absolute right-0 top-[calc(100%+6px)] z-20 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]";
const menuCaption = "px-3.5 pb-0.5 pt-0.5 text-[11px] tracking-widest text-[var(--ink-faint)]";
const menuDivider = "my-1 border-t border-[var(--hairline)]";

/** 插入类操作：不依赖选区，放在浮动工具条里既占地方又难点，收进 + 菜单 */
const INSERT_ITEMS: { cmd: FormatCommand; icon: React.ReactNode; label: string }[] = [
  { cmd: "image", icon: <ImageIcon size={14} />, label: "图片" },
  { cmd: "video", icon: <Film size={14} />, label: "视频（上传）" },
  { cmd: "table", icon: <Table size={14} />, label: "表格" },
  { cmd: "codeblock", icon: <SquareCode size={14} />, label: "代码块" },
  { cmd: "tasklist", icon: <ListTodo size={14} />, label: "任务列表" },
  { cmd: "hr", icon: <Minus size={14} />, label: "分割线" },
];

/** 导出格式：低频动作，收进 ⋯ 菜单的「导出」小节 */
const EXPORT_ITEMS: { kind: ExportKind; label: string }[] = [
  { kind: "md", label: "导出 Markdown" },
  { kind: "html", label: "导出 HTML" },
  { kind: "docx", label: "导出 Word（可导入飞书）" },
  { kind: "pdf", label: "导出 PDF（打印）" },
  { kind: "image", label: "导出长图（PNG）" },
];

// memo：这一簇按钮跟正文无关，却和编辑区共处同一棵树，打字时不该跟着重渲染。
// 前提是父级把回调都 useCallback 住了（见 ArticleReader），且不再接收逐字变化的字数——
// 它只需要知道「有没有内容」来决定复制按钮的可用态，于是收成一个布尔量
export const ReaderActions = memo(function ReaderActions({
  empty,
  split,
  onToggleSplit,
  reading,
  onToggleReading,
  outlineOpen,
  onToggleOutline,
  onInsert,
  onOpenVersions,
  onOpenShare,
  onDelete,
}: {
  /** 正文是否为空：为空时禁用一键复制 */
  empty: boolean;
  split: boolean;
  onToggleSplit: () => void;
  reading: boolean;
  onToggleReading: () => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  /** 插入类命令直通编辑器的 applyFormat */
  onInsert: (cmd: FormatCommand) => void;
  onOpenVersions: () => void;
  onOpenShare: () => void;
  onDelete?: () => void;
}) {
  const themeId = useStore((s) => s.themeId);
  const customThemes = useStore((s) => s.customThemes);
  const linkFootnote = useStore((s) => s.linkFootnote);
  const setLinkFootnote = useStore((s) => s.setLinkFootnote);
  const syncScroll = useStore((s) => s.syncScroll);
  const setSyncScroll = useStore((s) => s.setSyncScroll);
  const sourceMode = useStore((s) => s.sourceMode);
  const setSourceMode = useStore((s) => s.setSourceMode);

  const [copying, setCopying] = useState<"wechat" | "zhihu" | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // 只为 title 文案取主题名：resolveTheme 遇到自定义主题会全量重建 CSS，别每次渲染都跑
  const themeName = useMemo(() => resolveTheme(themeId, customThemes).name, [themeId, customThemes]);

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
      {/* 大纲开关：原在常驻工具栏最左，横栏撤掉后并入这里，激活态与双屏按钮同款 */}
      <button
        className={outlineOpen ? iconBtnOn : iconBtnIdle}
        title="大纲"
        onClick={onToggleOutline}
      >
        <ListTree size={15} />
      </button>
      {/* 插入：图片 / 视频 / 表格 / 代码块 / 任务列表 / 分割线 */}
      <div className="relative">
        <button
          className={insertOpen ? iconBtnOn : iconBtnIdle}
          title="插入"
          onClick={() => setInsertOpen((v) => !v)}
        >
          <Plus size={16} />
        </button>
        {insertOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setInsertOpen(false)} />
            <div className={`${menuCard} w-40`}>
              {INSERT_ITEMS.map((it) => (
                <button
                  key={it.cmd}
                  className={menuItem}
                  onClick={() => {
                    setInsertOpen(false);
                    onInsert(it.cmd);
                  }}
                >
                  {it.icon}
                  {it.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <span className="mx-1 h-5 w-px shrink-0 bg-[var(--hairline)]" />
      {/* 排版主题：面板底部还挂着字号/行高/段距的排版微调 */}
      <Dropdown
        width={430}
        trigger={
          <button className={iconBtnIdle} title={`排版主题：${themeName}`}>
            <Palette size={16} strokeWidth={1.75} />
          </button>
        }
      >
        <ThemePickerPanel />
      </Dropdown>
      {/* 版本历史 */}
      <button className={iconBtnIdle} onClick={onOpenVersions} title="版本历史">
        <History size={16} strokeWidth={1.75} />
      </button>
      {/* 一键复制：点开选择平台（纯图标） */}
      <div className="relative">
        <button
          className="flex h-8 cursor-pointer items-center gap-0.5 rounded-lg pl-2 pr-1.5 text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-45"
          onClick={() => setCopyMenuOpen((v) => !v)}
          disabled={empty || copying !== null}
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
      <button
        className={split ? iconBtnOn : iconBtnIdle}
        title="双屏：左源码、右公众号真实效果（⌘E）"
        onClick={onToggleSplit}
      >
        <Columns2 size={15} />
      </button>
      {/* 阅读模式：整块编辑区换成渲染后的成品，宽栏通读。
          进出同一个按钮，图标自己说明当前该往哪走，不再另加高亮态 */}
      <button
        className={iconBtnIdle}
        title={reading ? "返回编辑（⌘⇧E）" : "阅读模式：全屏只看渲染后的成品（⌘⇧E）"}
        onClick={onToggleReading}
      >
        {reading ? <PenLine size={15} /> : <BookOpen size={15} />}
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
            <div className={`${menuCard} w-52`}>
              {/* 分享：公开链接（永久）+ 访客批注 */}
              <button
                className={menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onOpenShare();
                }}
              >
                <Share2 size={13} />
                分享给他人查看与批注…
              </button>
              <div className={menuDivider} />
              <p className={menuCaption}>导出</p>
              {EXPORT_ITEMS.map(({ kind, label }) => (
                <button
                  key={kind}
                  className={menuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    void runExport(kind);
                  }}
                >
                  {label}
                </button>
              ))}
              <div className={menuDivider} />
              {/* 开关行自带 stopPropagation，连续切换时菜单不收 */}
              <ToggleRow label="外链转文末引用" value={linkFootnote} onChange={setLinkFootnote} />
              <ToggleRow label="同步滚动" value={syncScroll} onChange={setSyncScroll} />
              <ToggleRow label="源码模式（⌘/）" value={sourceMode} onChange={setSourceMode} />
              {onDelete ? (
                <>
                  <div className={menuDivider} />
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
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
});
