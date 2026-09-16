"use client";

import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlignLeft, Loader2, Folder, ChevronDown, RefreshCw } from "lucide-react";
import { askCategoryPick, CREATE_CATEGORY } from "./CategoryPickDialog";
import { wordCount } from "@/lib/wordCount";
import { askInput } from "./PromptDialog";
import { toast } from "./Toast";
import { useStore } from "@/store/useStore";
import { useDragDivider } from "@/hooks/useDragDivider";
import { useEditorDoc } from "@/hooks/useEditorDoc";
import { useSyncScroll } from "@/hooks/useSyncScroll";
import { MarkdownEditor } from "./MarkdownEditor";
import type { EditorHandle, SelectionInfo } from "@/lib/editor/types";
import type { FormatCommand } from "@/lib/editor/commands";
import { useEditorViewMode } from "@/hooks/useEditorViewMode";
import { FloatingToolbar } from "./FloatingToolbar";
import { ReaderActions } from "@/features/editor/components/ReaderActions";
import { useReaderCommands } from "@/features/editor/hooks/useReaderCommands";
import { ShareDialog } from "@/features/share/ShareDialog";
import { isLocalId } from "@/lib/localDocs";
import { useWikiLinkOpen } from "@/hooks/useWikiLinkOpen";
import { useRenameLinks } from "@/hooks/useRenameLinks";
import type { DocMeta } from "@/features/workspace/types";
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
 * - 默认：Markdown 即时渲染编辑器；
 * - 双屏（⌘E）：同一窗口内切出右侧公众号真实主题预览（左源码 / 右效果）；
 * - 阅读模式（⌘⇧E）：整块编辑区换成渲染后的成品，宽栏通读，退出即回编辑。
 */
export function ArticleReader({
  docId,
  actionSlot,
  categories,
  onCategoryChange,
  onDelete,
  docs,
  onOpenDoc,
  onCreateDoc,
}: {
  docId: string;
  /** 面包屑顶栏右侧的挂载点：操作按钮 portal 到这里，与面包屑共用一行 */
  actionSlot?: HTMLElement | null;
  /** 「移动到分类」候选列表（已排序），由首页汇总自建分类 + 各文章分类 */
  categories?: string[];
  /** 分类变更后通知首页同步列表状态（持久化由自动保存管线完成） */
  onCategoryChange?: (category: string) => void;
  onDelete?: () => void;
  /** 全部文章（不含回收站）：`[[双向链接]]` 按标题在这里找目标 */
  docs?: DocMeta[];
  onOpenDoc?: (id: string) => void;
  /** 双向链接指向的文章还不存在时，按目标标题建一篇并打开 */
  onCreateDoc?: (category: string, init: { title: string }) => void | Promise<void>;
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
  const [outlineOpen, setOutlineOpen] = useState(false);

  const editorRef = useRef<EditorHandle>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const splitAreaRef = useRef<HTMLDivElement>(null);
  // 标题 + 正文的共同滚动容器：用 state 而非 ref，挂载后要重新渲染把它传给编辑器
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const { mode, previewMounted, toggleSplit, toggleReading } = useEditorViewMode(editorRef, scrollEl);
  const split = mode === "split";
  const reading = mode === "read";
  // 选区上报走订阅而不是 state：光标每动一下都 setState 会白白重渲染整个文章视图，
  // 而浮动工具条只是挂在 body 上的旁路组件，让它自己订阅这条流就够了
  const selectionSubRef = useRef<((info: SelectionInfo | null) => void) | null>(null);
  const emitSelection = useCallback((info: SelectionInfo | null) => {
    selectionSubRef.current?.(info);
  }, []);
  const subscribeSelection = useCallback((cb: (info: SelectionInfo | null) => void) => {
    selectionSubRef.current = cb;
    return () => {
      if (selectionSubRef.current === cb) selectionSubRef.current = null;
    };
  }, []);

  // [[双向链接]]：编辑器与预览只派事件，按标题找文章 / 追问是否新建都落在这个 hook 里
  useWikiLinkOpen({
    docs: docs ?? [],
    category: category || "未分类",
    openDoc: onOpenDoc ?? (() => {}),
    createDoc: onCreateDoc ?? (() => {}),
  });

  // 改标题后把别处指向本文的 `[[双向链接]]` 一并改掉（Obsidian 的 rename 更新引用）。
  // 刷新走 DOCS_CHANGED 广播（写库时自动发出，useDocLibrary 听着），不必额外传回调
  const { onTitleFocus, onTitleBlur } = useRenameLinks({ docId, docs, title, docVersion });

  const applyFormat = useCallback((cmd: FormatCommand, arg?: string) => {
    editorRef.current?.applyFormat(cmd, arg);
  }, []);
  const { setActive, onEditorScrollLine, onPreviewScroll } = useSyncScroll(
    editorRef,
    previewRef
  );

  // 源码/预览分隔条：拖动中只走本地值，松手才写 store——
  // splitRatio 是 persist 持久化字段，每帧写它等于一次拖动往 localStorage 刷上百次
  const splitDrag = useDragDivider<DOMRect | null>({
    start: () => splitAreaRef.current?.getBoundingClientRect() ?? null,
    move: (ev, rect) => {
      if (!rect || rect.width === 0) return undefined;
      // 夹的区间与 store 里的 setSplitRatio 一致：拖动中显示的就是最终会落库的值
      return Math.min(0.75, Math.max(0.25, (ev.clientX - rect.left) / rect.width));
    },
    commit: setSplitRatio,
  });
  // 拖动中用实时值，松手后回到 store 那份
  const shownRatio = splitDrag.value ?? splitRatio;

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

  /** 分享要求登录 + 云端文档，本地草稿先提示。
      下面这几个回调都裹 useCallback：ReaderActions 已 memo，回调引用一变 memo 就白做了 */
  const openShare = useCallback(() => {
    if (!loggedIn || isLocalId(docId)) {
      toast("登录后才能分享文章", "error");
      return;
    }
    setShareOpen(true);
  }, [loggedIn, docId]);
  const openOutline = useCallback(() => setOutlineOpen(true), []);
  const closeOutline = useCallback(() => setOutlineOpen(false), []);
  const openVersions = useCallback(() => setVersionsOpen(true), []);

  // 命令面板（⌘⇧P）里的文章相关命令：格式 / 视图 / 文章 / 复制导出。
  // 只在文章打开时注册，随本组件一起卸载
  useReaderCommands({
    applyFormat,
    toggleSplit,
    toggleReading,
    openVersions,
    pickCategory: () => void pickCategory(),
    openShare,
    onDelete,
  });

  // 字数只在正文变化时重扫（wordCount 内部要过 4 遍正则，别跟着每次渲染跑）。
  // 再套一层 useDeferredValue：字数是「顺带看一眼」的信息，让它落在低优先级渲染里，
  // 连打时先把光标与正文画出来，全文扫描往后排
  const deferredContent = useDeferredValue(content);
  const chars = useMemo(() => wordCount(deferredContent), [deferredContent]);

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
      {/* 顶部操作栏：插入 / 主题 / 版本 / 复制 / 双屏 / 阅读 / 更多
          —— portal 到面包屑顶栏右侧，与之共用一行，省掉一整条横栏 */}
      {actionSlot
        ? createPortal(
            <ReaderActions
              empty={chars === 0}
              split={split}
              onToggleSplit={toggleSplit}
              reading={reading}
              onToggleReading={toggleReading}
              onInsert={applyFormat}
              onOpenVersions={openVersions}
              onOpenShare={openShare}
              onDelete={onDelete}
            />,
            actionSlot
          )
        : null}

      {/* 阅读视图独立挂载，编辑器始终保留，避免丢失选区和撤销历史。 */}
      {reading ? <Preview variant="reading" onExit={toggleReading} /> : null}
      {/* 编辑区（默认单屏）/ 双屏（左源码 + 右预览） */}
      <div ref={splitAreaRef} className={`${reading ? "hidden" : "flex"} min-h-0 min-w-0 flex-1`}>
        {/* 源码编辑列 */}
        <div
          className={`flex min-w-0 flex-col bg-[var(--panel)] ${
            splitDrag.dragging
              ? "" // 拖动期间关掉宽度过渡，否则宽度动画滞后于指针
              : "transition-[width] duration-300 ease-[cubic-bezier(0.22,0.9,0.26,1)]"
          }`}
          style={{ width: split ? `${shownRatio * 100}%` : "100%" }}
          onPointerEnter={() => setActive("editor")}
        >
          <div className="flex min-h-0 flex-1">
            {/* 大纲面板：宽度过渡开合，面板本体定宽避免文字随宽度挤压 */}
            <div
              inert={!outlineOpen}
              aria-hidden={!outlineOpen}
              className={`shrink-0 overflow-hidden transition-[width] duration-[260ms] ease-[cubic-bezier(0.22,0.9,0.26,1)] ${
                outlineOpen ? "w-52" : "w-0"
              }`}
            >
              <OutlinePanel
                active={outlineOpen}
                onClose={closeOutline}
                onJump={(line) => editorRef.current?.scrollToLine(line)}
              />
            </div>
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              {/* 飞书式目录入口，贴在正文列左上角的留白里，展开后由面板顶部的收起按钮接管 */}
              {!outlineOpen ? (
                <button
                  type="button"
                  title="目录"
                  aria-label="展开目录"
                  onClick={openOutline}
                  className="absolute left-1.5 top-[38px] z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
                >
                  <AlignLeft size={15} strokeWidth={1.75} />
                </button>
              ) : null}
              {/* 标题区与正文共用一个滚动容器：标题随正文一起滚出视野，
                  正文不再从固定标题下方被硬切。编辑器自身改为高度自适应（.reader-live），
                  滚动读写由 MarkdownEditor 的 scrollParent 接管 */}
              <div ref={setScrollEl} className="min-h-0 flex-1 overflow-y-auto">
                {/* 标题 + 元信息：左缘与正文文字对齐（28px = .cm-doc/.cm-split 的行内缩） */}
                {/* pt 比原来多 12px：常驻工具栏撤掉后，标题不能直接顶在面包屑下沿 */}
                <div className={`w-full pt-8 ${split ? "px-7" : "mx-auto max-w-[760px] px-7"}`}>
                  <input
                    className="w-full bg-transparent text-[27px] font-bold leading-[1.3] tracking-tight text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
                    value={title}
                    placeholder="未命名文章"
                    onChange={(e) => setTitle(e.target.value)}
                    onFocus={() => {
                      // 先记原样再清占位：清空后的 "" 不该被当成「改名前叫这个」
                      onTitleFocus();
                      if (title === "未命名文章") setTitle("");
                    }}
                    onBlur={() => {
                      onTitleBlur();
                      if (!title.trim()) setTitle("未命名文章");
                    }}
                  />
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--ink-faint)]">
                    {/* 深层级路径太长压垮元信息行：只显末级名，全路径挂在悬停提示里；
                        点击弹带搜索的分类选择器（与文章列表右键菜单同款）。
                        平时不带底色，和同行的保存状态、字数一种质感，悬停才浮出浅底提示可点 */}
                    <button
                      className="-ml-1 flex max-w-[260px] cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
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
                {/* Markdown 编辑器：默认即时渲染（设置里可切回源码模式）。
                    单屏时加 .cm-doc → 正文居中在可读宽度；双屏时加 .cm-split → 填满左栏但加大行内缩。
                    .reader-live 让编辑器高度自适应，滚动交给上面的外层容器 */}
                <div
                  className={`w-full cm-reader reader-live ${split ? "cm-split" : "cm-doc"}`}
                >
                  <MarkdownEditor
                    key={docKey}
                    ref={editorRef}
                    docKey={docKey}
                    initialContent={useStore.getState().content}
                    live={!sourceMode}
                    docs={docs}
                    onChange={setContent}
                    onScrollLine={onEditorScrollLine}
                    onSelectionChange={emitSelection}
                    scrollParent={scrollEl}
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
              onPointerDown={splitDrag.onPointerDown}
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

      {/* Notion 式浮动工具条：选中正文才浮出，portal 到 body、fixed 跟随选区 */}
      {!reading ? (
        <FloatingToolbar
          subscribe={subscribeSelection}
          editorRef={editorRef}
          scrollEl={scrollEl}
          onCommand={applyFormat}
        />
      ) : null}

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
