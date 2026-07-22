"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Loader2,
  Columns2,
  Folder,
  Copy,
  ChevronDown,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { buildWechatHtml } from "@/lib/copy/wechat";
import { buildZhihuHtml } from "@/lib/copy/zhihu";
import { copyRichHtml } from "@/lib/copy/clipboard";
import { toast } from "./Toast";
import { getTheme, getCodeThemeCss, buildTuneCss } from "@/lib/themes";
import { useStore } from "@/store/useStore";
import { useEditorDoc } from "@/hooks/useEditorDoc";
import { useSyncScroll } from "@/hooks/useSyncScroll";
import { MarkdownEditor, type EditorHandle } from "./MarkdownEditor";
import { EditorToolbar } from "./EditorToolbar";
import { EditorTools } from "./EditorTools";
import { OutlinePanel } from "./OutlinePanel";
import { Preview } from "./Preview";
import { VersionsPanel } from "./VersionsPanel";

const SAVE_LABEL: Record<string, string> = {
  local: "已存本地",
  saving: "保存中…",
  saved: "已保存",
  pending: "已存本地，联网后同步",
  error: "保存失败",
};

/**
 * 首页右侧的文章视图：默认是纯 Markdown 源码编辑器（不做即时渲染）；
 * 点「双屏」在同一窗口内切出右侧公众号真实主题预览（左源码 / 右效果），再点收起，
 * 不再跳转到独立编辑页。
 */
export function ArticleReader({
  docId,
  actionSlot,
  onOpenCategory,
  onDelete,
}: {
  docId: string;
  /** 面包屑顶栏右侧的挂载点：操作按钮 portal 到这里，与面包屑共用一行 */
  actionSlot?: HTMLElement | null;
  onOpenCategory: (path: string) => void;
  onDelete?: () => void;
}) {
  // 装载 + 自动保存复用编辑页管线（本地/云端文档皆可）
  const { docVersion, loading, loggedIn, reload } = useEditorDoc(docId);

  const title = useStore((s) => s.title);
  const content = useStore((s) => s.content);
  const category = useStore((s) => s.category);
  const saveState = useStore((s) => s.saveState);
  const setTitle = useStore((s) => s.setTitle);
  const setContent = useStore((s) => s.setContent);
  const splitRatio = useStore((s) => s.splitRatio);
  const setSplitRatio = useStore((s) => s.setSplitRatio);
  const sourceMode = useStore((s) => s.sourceMode);

  const [copying, setCopying] = useState<"wechat" | "zhihu" | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  // 默认单屏 Markdown 编辑；开启后右侧切出真实主题预览
  const [split, setSplit] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  // 预览列延迟卸载：收起时先让宽度动画走完再卸载，避免右栏瞬间消失
  const [previewMounted, setPreviewMounted] = useState(false);
  // 拖拽分隔条期间关闭宽度过渡，否则拖动会"追帧"发飘
  const [draggingSplit, setDraggingSplit] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const editorRef = useRef<EditorHandle>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const splitAreaRef = useRef<HTMLDivElement>(null);
  const { setActive, onEditorScrollLine, onPreviewScroll } = useSyncScroll(
    editorRef,
    previewRef
  );

  const toggleSplit = useCallback(() => {
    const next = !split;
    setSplit(next);
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (next) {
      setPreviewMounted(true);
    } else {
      closeTimer.current = setTimeout(() => setPreviewMounted(false), 300);
    }
  }, [split]);

  // ⌘E 切换双屏预览、⌘/ 切换源码模式（capture 阶段，优先于页面内其他监听）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        toggleSplit();
      } else if (e.key === "/") {
        e.preventDefault();
        const s = useStore.getState();
        s.setSourceMode(!s.sourceMode);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toggleSplit]);

  const onDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const divider = e.currentTarget;
    divider.setPointerCapture(e.pointerId);
    setDraggingSplit(true);
    const onMove = (ev: PointerEvent) => {
      const rect = splitAreaRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      setSplitRatio((ev.clientX - rect.left) / rect.width);
    };
    const onUp = () => {
      divider.removeEventListener("pointermove", onMove);
      setDraggingSplit(false);
    };
    divider.addEventListener("pointermove", onMove);
    divider.addEventListener("pointerup", onUp, { once: true });
  };

  /** 直接复制到公众号，与编辑页的复制管线一致 */
  const copyWechat = async () => {
    if (copying) return;
    setCopying("wechat");
    try {
      const s = useStore.getState();
      const html = await buildWechatHtml(s.content, {
        themeCss: getTheme(s.themeId).css,
        codeCss: await getCodeThemeCss(s.codeThemeId),
        customCss: `${buildTuneCss(s)}\n${s.customCss}`.trim(),
        macCode: s.macCode,
        linkFootnote: s.linkFootnote,
      });
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

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-[13px] text-[var(--ink-faint)]">
        <Loader2 size={16} className="animate-spin" /> 加载中…
      </div>
    );
  }

  const chars = content.replace(/\s/g, "").length;
  const docKey = `${docId}:${docVersion}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 顶部操作栏：一键复制 / 双屏 / 更多 —— portal 到面包屑顶栏右侧，与之共用一行，省掉一整条横栏 */}
      {actionSlot
        ? createPortal(
            <>
        {/* 排版主题 / 设置 / AI / 版本 / 导出 —— 从老编辑页搬来的功能簇 */}
        <EditorTools editorRef={editorRef} onOpenVersions={() => setVersionsOpen(true)} />
        <span className="mx-1 h-5 w-px shrink-0 bg-[var(--hairline)]" />
        {/* 一键复制：点开选择平台（纯图标） */}
        <div className="relative">
          <button
            className="flex h-8 cursor-pointer items-center gap-0.5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] pl-2 pr-1.5 text-[var(--ink)] hover:bg-[var(--paper)] disabled:cursor-default disabled:opacity-45"
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
              <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-40 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
                <button
                  className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
                  onClick={() => {
                    setCopyMenuOpen(false);
                    void copyWechat();
                  }}
                >
                  复制到公众号
                </button>
                <button
                  className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
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
          className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors ${
            split
              ? "bg-[var(--accent)] text-[var(--accent-fg)] shadow-[0_1px_4px_rgba(0,0,0,0.18)] hover:bg-[var(--accent-deep)]"
              : "border border-[var(--hairline-strong)] bg-[var(--panel)] text-[var(--ink)] hover:bg-[var(--paper)]"
          }`}
          title="双屏：左源码、右公众号真实效果（⌘E）"
          onClick={toggleSplit}
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
              <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-44 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
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
            </>,
            actionSlot
          )
        : null}

      {/* 编辑区（默认单屏）/ 双屏（左源码 + 右预览） */}
      <div ref={splitAreaRef} className="flex min-h-0 min-w-0 flex-1">
        {/* 源码编辑列 */}
        <div
          className={`flex min-w-0 flex-col bg-[var(--panel)] ${
            draggingSplit
              ? ""
              : "transition-[width] duration-300 ease-[cubic-bezier(0.22,0.9,0.26,1)]"
          }`}
          style={{ width: split ? `${splitRatio * 100}%` : "100%" }}
          onPointerEnter={() => setActive("editor")}
        >
          <EditorToolbar
            onCommand={(cmd) => editorRef.current?.applyFormat(cmd)}
            outlineOpen={outlineOpen}
            onToggleOutline={() => setOutlineOpen((v) => !v)}
            centered={!split}
          />
          <div className="flex min-h-0 flex-1">
            {/* 大纲面板：宽度过渡开合，面板本体定宽避免文字随宽度挤压 */}
            <div
              className={`shrink-0 overflow-hidden transition-[width] duration-[260ms] ease-[cubic-bezier(0.22,0.9,0.26,1)] ${
                outlineOpen ? "w-52" : "w-0"
              }`}
            >
              <OutlinePanel onJump={(line) => editorRef.current?.scrollToLine(line)} />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* 标题 + 元信息（固定于源码上方）：左缘与正文文字对齐
                  （单屏 16px = .cm-doc 行内缩，双屏 24px = .cm-split 行内缩） */}
              <div className="shrink-0">
                <div className={`w-full pt-5 ${split ? "px-6" : "mx-auto max-w-[760px] px-4"}`}>
                  <input
                    className="w-full bg-transparent text-[27px] font-bold leading-[1.3] tracking-tight text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] [font-family:var(--serif)]"
                    value={title}
                    placeholder="未命名文章"
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--ink-faint)]">
                    <button
                      className="flex cursor-pointer items-center gap-1 rounded-md bg-[var(--accent-wash)] px-2 py-0.5 text-[var(--ink-soft)] hover:text-[var(--ink)]"
                      onClick={() => onOpenCategory(category || "未分类")}
                    >
                      <Folder size={12} />
                      {category || "未分类"}
                    </button>
                    <span>·</span>
                    <span>{SAVE_LABEL[saveState] ?? saveState}</span>
                    <span>·</span>
                    <span>{chars} 字</span>
                    {chars > 0 ? (
                      <>
                        <span>·</span>
                        <span>约 {Math.max(1, Math.ceil(chars / 400))} 分钟读完</span>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-3 h-px w-10 bg-[var(--hairline-strong)]" />
                </div>
              </div>
              {/* Markdown 编辑器：填满整列宽高，默认即时渲染（设置里可切回源码模式）。
                  单屏时加 .cm-doc → 正文居中在可读宽度、滚动条落到列最右缘；
                  双屏时加 .cm-split → 填满左栏但加大行内缩，不贴分隔条 */}
              <div className="min-h-0 flex-1">
                <div className={`h-full w-full cm-reader ${split ? "cm-split" : "cm-doc"}`}>
                  <MarkdownEditor
                    key={docKey}
                    ref={editorRef}
                    docKey={docKey}
                    initialContent={useStore.getState().content}
                    live={!sourceMode}
                    onChange={setContent}
                    onScrollLine={onEditorScrollLine}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 可拖拽分隔条 + 右侧预览：收起时先走完宽度动画再卸载 */}
        {previewMounted ? (
          <>
            <div
              className="group relative z-10 w-[5px] shrink-0 cursor-col-resize border-l border-[var(--hairline)] bg-[var(--panel)] hover:bg-[var(--accent-wash)]"
              onPointerDown={onDividerPointerDown}
              title="拖动调整源码/预览宽度"
            >
              <span className="absolute left-1/2 top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--hairline-strong)] group-hover:bg-[var(--accent)]" />
            </div>
            <div
              className={`min-w-0 flex-1 transition-opacity duration-200 ${
                split ? "opacity-100" : "opacity-0"
              }`}
              onPointerEnter={() => setActive("preview")}
            >
              <Preview ref={previewRef} onScroll={onPreviewScroll} />
            </div>
          </>
        ) : null}
      </div>

      {/* 版本历史抽屉：由功能簇里的「版本」按钮唤起 */}
      <VersionsPanel
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        loggedIn={loggedIn}
        onRestored={reload}
      />
    </div>
  );
}
