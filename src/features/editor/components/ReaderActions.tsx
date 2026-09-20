"use client";

// 文章视图顶栏右侧的操作簇：插入 / 一键复制 / 审核 / 阅读 / 更多。
// 双屏也是「换个视图看」的开关，和源码模式同类，于是跟它并排收进 ⋯ 菜单，顶栏不再单占一个图标。
// 排版主题只影响渲染后的预览，切换入口放在预览顶栏（见 ThemeTrigger），编辑态不再露出。
// 由 ArticleReader portal 到面包屑顶栏，与面包屑共用一行（从 ArticleReader 搬出）。
// 常驻工具栏改成浮动工具条后，插入类操作没了去处，一并收进这里。
// 低频项（分享 / 导出 / 三个开关 / 删除）统一收进 ⋯ 菜单，顶栏只留常用动作。

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useEscape } from "@/hooks/useEscape";
import { ReviewLaunchPopover } from "@/features/review/ReviewLaunchPopover";
import {
  BookOpen,
  ChevronDown,
  Copy,
  Film,
  History,
  Image as ImageIcon,
  ListTodo,
  Loader2,
  Minus,
  MoreHorizontal,
  SpellCheck,
  Palette,
  PenLine,
  Plus,
  Share2,
  SquareCode,
  Table,
  Trash2,
} from "lucide-react";
import type { FormatCommand } from "@/lib/editor/commands";
import { ThemePickerPanel } from "@/components/ThemePicker";
import { resolveTheme } from "@/lib/themes";
import { isDesktopShell } from "@/lib/desktopShell";
import { useStore } from "@/store/useStore";
import { ToggleRow } from "./MenuControls";
import { copyDoc, type CopyTarget } from "../lib/copyDoc";
import { sendWechatDraft } from "../lib/sendWechatDraft";
import { EXPORT_ITEMS, runExport } from "../lib/exportDoc";

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

// memo：这一簇按钮跟正文无关，却和编辑区共处同一棵树，打字时不该跟着重渲染。
// 前提是父级把回调都 useCallback 住了（见 ArticleReader），且不再接收逐字变化的字数——
// 它只需要知道「有没有内容」来决定复制按钮的可用态，于是收成一个布尔量
export const ReaderActions = memo(function ReaderActions({
  empty,
  split,
  onToggleSplit,
  review,
  docId,
  onStartReview,
  onOpenReviewRecord,
  onExitReview,
  reading,
  onToggleReading,
  onInsert,
  onOpenVersions,
  onOpenShare,
  onDelete,
}: {
  /** 正文是否为空：为空时禁用一键复制 */
  empty: boolean;
  split: boolean;
  onToggleSplit: () => void;
  /** AI 审核模式开着没有（标注直接画在编辑器里，开启会先从双屏 / 阅读退回普通编辑视图） */
  review: boolean;
  /** 按启动面板里选好的类型与模型开跑 */
  onStartReview: () => void;
  /** 审核历史按文章归档；点历史里的一趟就直接翻出来看，不重新审 */
  docId: string;
  onOpenReviewRecord: (id: string) => void;
  onExitReview: () => void;
  reading: boolean;
  onToggleReading: () => void;
  /** 插入类命令直通编辑器的 applyFormat */
  onInsert: (cmd: FormatCommand) => void;
  onOpenVersions: () => void;
  onOpenShare: () => void;
  onDelete?: () => void;
}) {
  const linkFootnote = useStore((s) => s.linkFootnote);
  const setLinkFootnote = useStore((s) => s.setLinkFootnote);
  const syncScroll = useStore((s) => s.syncScroll);
  const setSyncScroll = useStore((s) => s.setSyncScroll);
  const sourceMode = useStore((s) => s.sourceMode);
  const setSourceMode = useStore((s) => s.setSourceMode);
  const themeId = useStore((s) => s.themeId);
  const customThemes = useStore((s) => s.customThemes);

  const [copying, setCopying] = useState<CopyTarget | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  /** 发送到公众号草稿的进行中状态（本机草稿服务回报的一句话）；null = 没在发 */
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  /** 从复制菜单跳过来的主题面板：复制前顺手换主题，不必先切到预览 */
  const [themeOpen, setThemeOpen] = useState(false);
  // Esc 收起复制菜单 / 主题面板，与其他浮层一致
  useEscape(() => {
    setCopyMenuOpen(false);
    setThemeOpen(false);
  }, copyMenuOpen || themeOpen);
  const [insertOpen, setInsertOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** 「审核」的启动面板：先选审核类型与模型，再开跑（Esc / 点外面收起由面板自己管） */
  const [launchOpen, setLaunchOpen] = useState(false);
  const reviewBtnRef = useRef<HTMLButtonElement>(null);
  const isAdmin = useSession().data?.user?.isAdmin === true;
  const closeLaunch = useCallback(() => {
    setLaunchOpen(false);
    // 焦点还回按钮：键盘用户收起面板后不该被扔回页面开头
    reviewBtnRef.current?.focus();
  }, []);

  // 只为菜单里那行说明取主题名：resolveTheme 遇到自定义主题会全量重建 CSS，别每次渲染都跑
  const themeName = useMemo(() => resolveTheme(themeId, customThemes).name, [themeId, customThemes]);

  /** 复制逻辑在 lib/copyDoc（命令面板也调它），这里只负责「复制中」的按钮态 */
  const copy = async (target: CopyTarget) => {
    if (copying) return;
    setCopying(target);
    try {
      await copyDoc(target);
    } finally {
      setCopying(null);
    }
  };

  return (
    <>
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
      {/* 一键复制：点开选择平台（纯图标） */}
      <div className="relative">
        <button
          className="flex h-8 cursor-pointer items-center gap-0.5 rounded-lg pl-2 pr-1.5 text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-45"
          onClick={() => setCopyMenuOpen((v) => !v)}
          disabled={empty || copying !== null || draftStatus !== null}
          title={draftStatus ?? "一键复制"}
        >
          {copying !== null || draftStatus !== null ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Copy size={15} />
          )}
          <ChevronDown size={13} className="opacity-70" />
        </button>
        {copyMenuOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setCopyMenuOpen(false)} />
            <div className={`${menuCard} w-48`}>
              {/* 复制出去的排版由主题决定，编辑态看不到；在这里点一下就能换，不必先切到预览 */}
              <div className="flex items-center gap-1 px-3.5 pb-1.5 pt-0.5 text-[11px] text-[var(--ink-faint)]">
                <Palette size={11} strokeWidth={1.75} className="shrink-0" />
                <span className="min-w-0 truncate">排版主题：{themeName}</span>
                <button
                  className="ml-auto shrink-0 cursor-pointer text-[var(--ink-soft)] underline decoration-[var(--hairline-strong)] underline-offset-2 hover:text-[var(--ink)]"
                  onClick={() => {
                    setCopyMenuOpen(false);
                    setThemeOpen(true);
                  }}
                >
                  切换
                </button>
              </div>
              <div className={menuDivider} />
              <button
                className={menuItem}
                onClick={() => {
                  setCopyMenuOpen(false);
                  void copy("wechat");
                }}
              >
                复制到公众号
              </button>
              <button
                className={menuItem}
                onClick={() => {
                  setCopyMenuOpen(false);
                  void copy("zhihu");
                }}
              >
                复制到知乎
              </button>
              {/* 「发送到公众号」要驱动本机的草稿服务开一个 Chrome 填后台，只有桌面壳里
                  服务才是自己起来的；纯浏览器里冒出个 Chrome 窗口很莫名，索性不露出。
                  菜单点开后才渲染（copyMenuOpen 初值 false，只有点击能翻开），
                  所以这里读 window 不会造成水合不一致。 */}
              {isDesktopShell() ? (
                <>
                  <div className={menuDivider} />
                  <button
                    className={menuItem}
                    onClick={() => {
                      setCopyMenuOpen(false);
                      void sendWechatDraft(setDraftStatus);
                    }}
                  >
                    发送到公众号
                  </button>
                </>
              ) : null}
            </div>
          </>
        ) : null}
        {themeOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setThemeOpen(false)} />
            {/* 与预览顶栏的主题入口同一块面板；选中主题即收起，和 Dropdown 的行为一致 */}
            <div
              className={`${menuCard} w-[430px] max-w-[calc(100vw-16px)] overflow-y-auto`}
              style={{ maxHeight: "calc(100vh - 64px)" }}
              onClick={() => setThemeOpen(false)}
            >
              <ThemePickerPanel />
            </div>
          </>
        ) : null}
      </div>
      {/* AI 审核：直接在编辑区的正文上标出可以再改的地方，右侧逐条给意见。
          点它不立刻开跑——先弹面板问清楚审哪一类、用谁审（审核开着时它就是退出键）。
          只给管理员看（口径同封面的「AI 生成」页签）：花的是站点的 key，真正的闸在服务端，
          这里只是不让用不了的人看见一颗点了就 403 的按钮 */}
      <div className={isAdmin ? "relative" : "hidden"}>
        <button
          ref={reviewBtnRef}
          data-menu-trigger
          className={`${review || launchOpen ? iconBtnOn : iconBtnIdle} disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent`}
          title={review ? "退出审核" : "AI 审核：选好类型与模型再开始"}
          onClick={() => {
            if (review) {
              setLaunchOpen(false);
              onExitReview();
              return;
            }
            setLaunchOpen((v) => !v);
          }}
          disabled={empty}
        >
          <SpellCheck size={15} />
        </button>
        {launchOpen && !review ? (
          <ReviewLaunchPopover
            docId={docId}
            onClose={closeLaunch}
            onStart={onStartReview}
            onOpenRecord={onOpenReviewRecord}
          />
        ) : null}
      </div>
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
              {/* 版本历史低频，收进菜单；顶栏只留复制这个核心动作 */}
              <button
                className={menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onOpenVersions();
                }}
              >
                <History size={13} />
                版本历史…
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
              {/* 双屏的开合逻辑（含「开着审核时切过去要先退出审核」）都在父级的 onToggleSplit 里，
                  这里只是换了个入口，开关状态仍由父级的 split 说了算 */}
              <ToggleRow label="双屏预览（⌘E）" value={split} onChange={onToggleSplit} />
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
