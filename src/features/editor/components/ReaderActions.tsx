"use client";

// Action cluster on the right of the article view's top bar: insert / one-click copy / review / reading / more.
// Split view is also a "view it differently" toggle, like source mode, so it sits beside it in the ⋯ menu instead of taking its own top bar icon.
// Typography themes only affect the rendered preview, so the switcher lives in the preview top bar (see ThemeTrigger) and no longer appears while editing.
// Portaled by ArticleReader into the breadcrumb top bar, sharing a row with the breadcrumb (moved out of ArticleReader).
// Once the always-on toolbar became a floating one, insert actions had nowhere to go, so they moved in here too.
// Low-frequency items (share / export / three toggles / delete) all go in the ⋯ menu; the top bar keeps only common actions.

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useEscape } from "@/hooks/useEscape";
import { useCan } from "@/hooks/usePermissions";
import { AiIcon } from "@/components/AiIcon";
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
import { desktopVersionAtLeast, isDesktopShell, WECHAT_DRAFT_MIN_VERSION } from "@/lib/desktopShell";
import { MAC_DOWNLOAD_URL } from "@/lib/site";
import { tk } from "@/i18n/t";
import { useT } from "@/i18n/useT";
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

/** Insert actions: they don't depend on the selection, and in the floating toolbar they'd take space and be hard to hit, so they live in the + menu */
const INSERT_ITEMS: { cmd: FormatCommand; icon: React.ReactNode; label: string }[] = [
  { cmd: "image", icon: <ImageIcon size={14} />, label: tk("图片") },
  { cmd: "video", icon: <Film size={14} />, label: tk("视频（上传）") },
  { cmd: "table", icon: <Table size={14} />, label: tk("表格") },
  { cmd: "codeblock", icon: <SquareCode size={14} />, label: tk("代码块") },
  { cmd: "tasklist", icon: <ListTodo size={14} />, label: tk("任务列表") },
  { cmd: "hr", icon: <Minus size={14} />, label: tk("分割线") },
];

// memo: these buttons have nothing to do with the body but share a tree with the editor, so they shouldn't re-render while typing.
// This relies on the parent wrapping all callbacks in useCallback (see ArticleReader) and no longer passing the per-keystroke word count —
// it only needs to know "is there content" to set the copy button's enabled state, so that's collapsed into a boolean
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
  /** Whether the body is empty: one-click copy is disabled when it is */
  empty: boolean;
  split: boolean;
  onToggleSplit: () => void;
  /** Whether AI review mode is on (annotations draw directly in the editor; enabling it first drops out of split / reading back to the normal editor view) */
  review: boolean;
  /** Start running with the type and model chosen in the launch panel */
  onStartReview: () => void;
  /** Review history is archived per article; clicking a past run opens it directly without re-reviewing */
  docId: string;
  onOpenReviewRecord: (id: string) => void;
  onExitReview: () => void;
  reading: boolean;
  onToggleReading: () => void;
  /** Insert commands go straight to the editor's applyFormat */
  onInsert: (cmd: FormatCommand) => void;
  onOpenVersions: () => void;
  onOpenShare: () => void;
  onDelete?: () => void;
}) {
  const t = useT();
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
  /** In-progress status of sending to the WeChat draft (a line reported by the local draft service); null = not sending */
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  /** Theme panel reached from the copy menu: switch themes right before copying without going to the preview first */
  const [themeOpen, setThemeOpen] = useState(false);
  // Esc closes the copy menu / theme panel, consistent with other overlays
  useEscape(() => {
    setCopyMenuOpen(false);
    setThemeOpen(false);
  }, copyMenuOpen || themeOpen);
  const [insertOpen, setInsertOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Launch panel for 「审核」 (Review): pick the review type and model first, then run (the panel handles Esc / outside clicks itself) */
  const [launchOpen, setLaunchOpen] = useState(false);
  const reviewBtnRef = useRef<HTMLButtonElement>(null);
  const canReview = useCan("ai_review");
  const closeLaunch = useCallback(() => {
    setLaunchOpen(false);
    // Return focus to the button: keyboard users shouldn't be dumped back at the top of the page after closing the panel
    reviewBtnRef.current?.focus();
  }, []);

  // Only to get the theme name for that line in the menu: resolveTheme fully rebuilds CSS for custom themes, so don't run it every render
  const themeName = useMemo(() => resolveTheme(themeId, customThemes).name, [themeId, customThemes]);

  /** Copy logic is in lib/copyDoc (the command palette calls it too); this only handles the "copying" button state */
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
      {/* Insert: image / video / table / code block / task list / divider */}
      <div className="relative">
        <button
          className={insertOpen ? iconBtnOn : iconBtnIdle}
          title={t("插入")}
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
                  {t(it.label)}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <span className="mx-1 h-5 w-px shrink-0 bg-[var(--hairline)]" />
      {/* One-click copy: opens a platform picker (icon only) */}
      <div className="relative">
        <button
          className="flex h-8 cursor-pointer items-center gap-0.5 rounded-lg pl-2 pr-1.5 text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-45"
          onClick={() => setCopyMenuOpen((v) => !v)}
          disabled={empty || copying !== null || draftStatus !== null}
          title={draftStatus ?? t("一键复制")}
        >
          {copying !== null || draftStatus !== null ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Copy size={16} />
          )}
          <ChevronDown size={14} className="opacity-70" />
        </button>
        {copyMenuOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setCopyMenuOpen(false)} />
            <div className={`${menuCard} w-48`}>
              {/* The copied formatting depends on the theme, which isn't visible while editing; one click here switches it, no need to go to the preview first */}
              <div className="flex items-center gap-1 px-3.5 pb-1.5 pt-0.5 text-[11px] text-[var(--ink-faint)]">
                <Palette size={12} className="shrink-0" />
                <span className="min-w-0 truncate">{t("排版主题：{name}", { name: t(themeName) })}</span>
                <button
                  className="ml-auto shrink-0 cursor-pointer text-[var(--ink-soft)] underline decoration-[var(--hairline-strong)] underline-offset-2 hover:text-[var(--ink)]"
                  onClick={() => {
                    setCopyMenuOpen(false);
                    setThemeOpen(true);
                  }}
                >
                  {t("切换")}
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
                {t("复制到公众号")}
              </button>
              <button
                className={menuItem}
                onClick={() => {
                  setCopyMenuOpen(false);
                  void copy("zhihu");
                }}
              >
                {t("复制到知乎")}
              </button>
              {/* 「发送到公众号」 (Send to WeChat) relies on the desktop shell's built-in draft service to fill the WeChat backend; the web version has no such service,
                  so it only shows a greyed-out hint pointing to the desktop app, so users don't think the feature is missing;
                  older shells (before 0.1.1) lack the service too and clicking would only report 「没连上」 (Not connected), so they get an update prompt instead.
                  The menu renders only after opening (copyMenuOpen starts false and only a click opens it),
                  so reading window here can't cause a hydration mismatch. */}
              <div className={menuDivider} />
              {desktopVersionAtLeast(WECHAT_DRAFT_MIN_VERSION) ? (
                <button
                  className={menuItem}
                  onClick={() => {
                    setCopyMenuOpen(false);
                    void sendWechatDraft(setDraftStatus);
                  }}
                >
                  {t("发送到公众号")}
                </button>
              ) : (
                <a
                  className={`${menuItem} text-[var(--ink-faint)]`}
                  href={MAC_DOWNLOAD_URL}
                  target="_blank"
                  rel="noreferrer"
                  title={
                    isDesktopShell()
                      ? t("当前客户端版本过旧，没有公众号草稿服务，请下载最新版")
                      : t("自动填进公众号后台草稿，仅桌面客户端支持")
                  }
                  onClick={() => setCopyMenuOpen(false)}
                >
                  <span>{t("发送到公众号")}</span>
                  <span className="ml-auto text-[11px]">
                    {isDesktopShell() ? t("请更新客户端 ↗") : t("需桌面版 ↗")}
                  </span>
                </a>
              )}
            </div>
          </>
        ) : null}
        {themeOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setThemeOpen(false)} />
            {/* The same panel as the preview top bar's theme entry; picking a theme closes it, consistent with Dropdown */}
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
      {/* AI review: marks spots worth revising directly on the body in the editor, with item-by-item comments on the right.
          Clicking doesn't start immediately — a panel first asks which kind of review and which model (while review is on, it's the exit button).
          Only shown to accounts with 「AI 审核」 (AI review) enabled (same rule as the cover's 「AI 生成」 tab, enabled per account in admin): it spends the site's key,
          the real gate is server-side, and this just keeps a button that would 403 away from people who can't use it */}
      <div className={canReview ? "relative" : "hidden"}>
        <button
          ref={reviewBtnRef}
          data-menu-trigger
          className={`${review || launchOpen ? iconBtnOn : iconBtnIdle} disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent`}
          title={review ? t("退出 AI 审核") : t("AI 审核：检查表述与公众号合规")}
          aria-label={review ? t("退出 AI 审核") : t("AI 审核")}
          aria-expanded={launchOpen && !review}
          aria-haspopup="dialog"
          aria-pressed={review}
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
          <AiIcon size={16} />
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
      {/* Reading mode: the whole editing area becomes the rendered result, a wide column for reading through.
          The same button enters and exits; the icon itself shows which way to go, with no extra active state */}
      <button
        className={iconBtnIdle}
        title={reading ? t("返回编辑（⌘⇧E）") : t("阅读模式：全屏只看渲染后的成品（⌘⇧E）")}
        onClick={onToggleReading}
      >
        {reading ? <PenLine size={16} /> : <BookOpen size={16} />}
      </button>
      <div className="relative">
        <button
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--panel)] hover:text-[var(--ink)]"
          title={t("更多操作")}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className={`${menuCard} w-52`}>
              {/* Share: public link (permanent) + visitor annotations */}
              <button
                className={menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onOpenShare();
                }}
              >
                <Share2 size={14} />
                {t("分享给他人查看与批注…")}
              </button>
              {/* Version history is low-frequency, so it lives in the menu; the top bar keeps only the core copy action */}
              <button
                className={menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onOpenVersions();
                }}
              >
                <History size={14} />
                {t("版本历史…")}
              </button>
              <div className={menuDivider} />
              <p className={menuCaption}>{t("导出")}</p>
              {EXPORT_ITEMS.map(({ kind, label }) => (
                <button
                  key={kind}
                  className={menuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    void runExport(kind);
                  }}
                >
                  {t(label)}
                </button>
              ))}
              <div className={menuDivider} />
              {/* Toggle rows stopPropagation themselves, so the menu stays open while toggling repeatedly */}
              <ToggleRow label={t("外链转文末引用")} value={linkFootnote} onChange={setLinkFootnote} />
              <ToggleRow label={t("同步滚动")} value={syncScroll} onChange={setSyncScroll} />
              <ToggleRow label={t("源码模式（⌘/）")} value={sourceMode} onChange={setSourceMode} />
              {/* Split view's toggle logic (including "exit review first when switching while review is on") is all in the parent's onToggleSplit;
                  this is just another entry point, and the toggle state is still owned by the parent's split */}
              <ToggleRow label={t("双屏预览（⌘E）")} value={split} onChange={onToggleSplit} />
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
                    <Trash2 size={14} />
                    {t("删除文章")}
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
