"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Folder, ChevronDown, RefreshCw } from "lucide-react";
import { askCategoryPick, CREATE_CATEGORY } from "./CategoryPickDialog";
import { wordCount } from "@/lib/wordCount";
import { askInput } from "./PromptDialog";
import { toast } from "./Toast";
import { useStore } from "@/store/useStore";
import { useEditorDoc } from "@/hooks/useEditorDoc";
import { useSyncScroll } from "@/hooks/useSyncScroll";
import { MarkdownEditor, type EditorHandle } from "./MarkdownEditor";
import { EditorToolbar } from "./EditorToolbar";
import { ReaderActions } from "@/features/editor/components/ReaderActions";
import { ShareDialog } from "@/features/share/ShareDialog";
import { isLocalId } from "@/lib/localDocs";
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
 * 首页右侧的文章视图，三种形态：
 * - 默认：纯 Markdown 源码编辑器（不做即时渲染）；
 * - 双屏（⌘E）：同一窗口内切出右侧公众号真实主题预览（左源码 / 右效果）；
 * - 阅读模式（⌘⇧E）：整块编辑区换成渲染后的成品，宽栏通读，退出即回编辑。
 */
export function ArticleReader({
  docId,
  actionSlot,
  categories,
  onCategoryChange,
  onDelete,
}: {
  docId: string;
  /** 面包屑顶栏右侧的挂载点：操作按钮 portal 到这里，与面包屑共用一行 */
  actionSlot?: HTMLElement | null;
  /** 「移动到分类」候选列表（已排序），由首页汇总自建分类 + 各文章分类 */
  categories?: string[];
  /** 分类变更后通知首页同步列表状态（持久化由自动保存管线完成） */
  onCategoryChange?: (category: string) => void;
  onDelete?: () => void;
}) {
  // 装载 + 自动保存复用编辑页管线（本地/云端文档皆可）
  const { docVersion, loading, loggedIn, reload, refreshedHint } = useEditorDoc(docId);

  const title = useStore((s) => s.title);
  const content = useStore((s) => s.content);
  const category = useStore((s) => s.category);
  const setCategory = useStore((s) => s.setCategory);
  const saveState = useStore((s) => s.saveState);
  const setTitle = useStore((s) => s.setTitle);
  const setContent = useStore((s) => s.setContent);
  const splitRatio = useStore((s) => s.splitRatio);
  const setSplitRatio = useStore((s) => s.setSplitRatio);
  const sourceMode = useStore((s) => s.sourceMode);

  const [shareOpen, setShareOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  // 默认单屏 Markdown 编辑；开启后右侧切出真实主题预览
  const [split, setSplit] = useState(false);
  // 阅读模式：整块编辑区换成渲染成品，与双屏互斥
  const [reading, setReading] = useState(false);
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
    // 双屏与阅读模式互斥：开双屏就退出阅读
    if (next) setReading(false);
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

  /** 进阅读模式时把双屏收掉：两者都是「看成品」，同时开着没有意义 */
  const toggleReading = useCallback(() => {
    setReading((v) => {
      const next = !v;
      if (next) {
        setSplit(false);
        setPreviewMounted(false);
        if (closeTimer.current) {
          clearTimeout(closeTimer.current);
          closeTimer.current = null;
        }
      }
      return next;
    });
  }, []);

  // ⌘E 切换双屏、⌘⇧E 切换阅读模式、⌘/ 切换源码模式
  // （capture 阶段，优先于页面内其他监听）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        if (e.shiftKey) toggleReading();
        else toggleSplit();
      } else if (e.key === "/") {
        e.preventDefault();
        const s = useStore.getState();
        s.setSourceMode(!s.sourceMode);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toggleSplit, toggleReading]);

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

  /** 移动分类：改 store 即可，持久化走自动保存管线（本地/云端/离线一致） */
  const moveToCategory = (c: string) => {
    if (c === (category || "未分类")) return;
    setCategory(c);
    onCategoryChange?.(c);
    toast(`已移动到「${c}」`, "success");
  };

  const moveToNewCategory = async () => {
    const name = (
      await askInput({ title: "新建分类并移入", placeholder: "分类名称，可用 / 建子分类" })
    )?.trim();
    if (!name) return;
    moveToCategory(name.slice(0, 100));
  };

  /** 分类几百个且层级深，弹带搜索的选择器（与文章列表右键菜单同款） */
  const pickCategory = async () => {
    const target = await askCategoryPick({
      title: "移动到分类",
      categories: categories ?? [],
      current: category || "未分类",
      createOption: "新建分类并移入…",
    });
    if (target === CREATE_CATEGORY) return void moveToNewCategory();
    if (target) moveToCategory(target);
  };

  /** 分享要求登录 + 云端文档，本地草稿先提示 */
  const openShare = () => {
    if (!loggedIn || isLocalId(docId)) {
      toast("登录后才能分享文章", "error");
      return;
    }
    setShareOpen(true);
  };

  // 字数只在正文变化时重扫（wordCount 内部要过 4 遍正则，别跟着每次渲染跑）
  const chars = useMemo(() => wordCount(content), [content]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-[13px] text-[var(--ink-faint)]">
        <Loader2 size={16} className="animate-spin" /> 加载中…
      </div>
    );
  }

  const docKey = `${docId}:${docVersion}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 顶部操作栏：功能簇 / 分享 / 复制 / 阅读 / 双屏 / 更多
          —— portal 到面包屑顶栏右侧，与之共用一行，省掉一整条横栏 */}
      {actionSlot
        ? createPortal(
            <ReaderActions
              chars={chars}
              split={split}
              onToggleSplit={toggleSplit}
              reading={reading}
              onToggleReading={toggleReading}
              onOpenVersions={() => setVersionsOpen(true)}
              onOpenShare={openShare}
              onDelete={onDelete}
            />,
            actionSlot
          )
        : null}

      {/* 阅读模式：整块编辑区换成渲染后的成品（双屏右栏那一面，宽栏通读） */}
      {reading ? (
        <Preview variant="reading" onExit={toggleReading} />
      ) : (
      /* 编辑区（默认单屏）/ 双屏（左源码 + 右预览） */
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
            onCommand={(cmd, arg) => editorRef.current?.applyFormat(cmd, arg)}
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
              <OutlinePanel
                active={outlineOpen}
                onJump={(line) => editorRef.current?.scrollToLine(line)}
              />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* 标题 + 元信息（固定于源码上方）：左缘与正文文字对齐
                  （单屏 16px = .cm-doc 行内缩，双屏 24px = .cm-split 行内缩） */}
              <div className="shrink-0">
                <div className={`w-full pt-5 ${split ? "px-6" : "mx-auto max-w-[760px] px-4"}`}>
                  <input
                    className="w-full bg-transparent text-[27px] font-bold leading-[1.3] tracking-tight text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
                    value={title}
                    placeholder="未命名文章"
                    onChange={(e) => setTitle(e.target.value)}
                    onFocus={() => {
                      if (title === "未命名文章") setTitle("");
                    }}
                    onBlur={() => {
                      if (!title.trim()) setTitle("未命名文章");
                    }}
                  />
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--ink-faint)]">
                    {/* 深层级路径太长压垮元信息行：只显末级名，全路径挂在悬停提示里；
                        点击弹带搜索的分类选择器（与文章列表右键菜单同款） */}
                    <button
                      className="flex max-w-[260px] cursor-pointer items-center gap-1 rounded-md bg-[var(--accent-wash)] px-2 py-0.5 text-[var(--ink-soft)] hover:text-[var(--ink)]"
                      title={`${category || "未分类"}\n点击移动到分类`}
                      onClick={() => void pickCategory()}
                    >
                      <Folder size={12} className="shrink-0" />
                      <span className="truncate">
                        {(category || "未分类").includes("/")
                          ? `…/${(category || "未分类").split("/").pop()}`
                          : category || "未分类"}
                      </span>
                      <ChevronDown size={11} className="shrink-0 opacity-60" />
                    </button>
                    <span>·</span>
                    {/* MCP / 其他设备改过、页面自动校新后，在这一格轻提示几秒再回落，不弹 toast */}
                    {refreshedHint ? (
                      <span className="sync-hint flex items-center gap-1 text-[var(--accent)]">
                        <RefreshCw size={11} />
                        已更新到最新版本
                      </span>
                    ) : (
                      <span>{SAVE_LABEL[saveState] ?? saveState}</span>
                    )}
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
              className="group relative z-10 w-[5px] shrink-0 cursor-col-resize border-l border-[var(--hairline-soft)] bg-[var(--panel)] hover:bg-[var(--accent-wash)]"
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
      )}

      {/* 版本历史抽屉：由功能簇里的「版本」按钮唤起 */}
      <VersionsPanel
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        loggedIn={loggedIn}
        onRestored={reload}
      />

      {/* 分享设置：公开链接 + 访客批注 */}
      {shareOpen ? <ShareDialog docId={docId} onClose={() => setShareOpen(false)} /> : null}
    </div>
  );
}
