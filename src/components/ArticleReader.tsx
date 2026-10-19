"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CoverPicker, COVER_KEY } from "@/features/editor/components/CoverPicker";
import { setFrontmatterValue } from "@/lib/frontmatter";
import { AlignLeft, Loader2, Folder, ChevronDown, RefreshCw } from "lucide-react";
import { askCategoryPick, CREATE_CATEGORY } from "./CategoryPickDialog";
import { wordCount } from "@/lib/wordCount";
import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";
import { askInput } from "./PromptDialog";
import { toast } from "./Toast";
import { useStore } from "@/store/useStore";
import { useDragDivider } from "@/hooks/useDragDivider";
import { useEditorDoc } from "@/hooks/useEditorDoc";
import { useScrollMemory } from "@/hooks/useScrollMemory";
import { useSyncScroll } from "@/hooks/useSyncScroll";
import { useTopLineChannel } from "@/hooks/useTopLine";
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
import { DocTimestamps } from "./DocTimestamps";
import { Preview } from "./Preview";
import { VersionsPanel } from "./VersionsPanel";
import { useReview } from "@/features/review/useReview";
import { REVIEW_MIN_WIDTH, useReviewLayout } from "@/features/review/useReviewLayout";
import { ReviewToolbar } from "@/features/review/ReviewToolbar";
import { ReviewCards, ReviewPopover } from "@/features/review/ReviewCards";
import { tk } from "@/i18n/t";
import { useT } from "@/i18n/useT";

const SAVE_LABEL: Record<string, string> = {
  local: tk("已存本地"),
  saving: tk("保存中…"),
  saved: tk("已保存"),
  pending: tk("已存本地，联网后同步"),
  error: tk("保存失败"),
  "local-error": tk("本地保存失败"),
};

/**
 * The article view on the right of the home page, in three forms:
 * - Default: the Markdown live-rendering editor;
 * - Split (⌘E): a right-hand pane in the same window with the real WeChat theme preview (source left / result right);
 * - Reading mode (⌘⇧E): the whole editing area is replaced by the rendered result for wide-column reading; exiting returns to editing.
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
  /** Mount point on the right of the breadcrumb top bar: action buttons portal here and share the row with the breadcrumb */
  actionSlot?: HTMLElement | null;
  /** Candidate list for 「移动到分类」 (Move to category), sorted; aggregated by the home page from custom categories + each article's category */
  categories?: string[];
  /** Notifies the home page to sync list state after a category change (persistence is handled by the autosave pipeline) */
  onCategoryChange?: (category: string) => void;
  onDelete?: () => void;
  /** All articles (excluding trash): `[[wiki links]]` look up their targets here by title */
  docs?: DocMeta[];
  onOpenDoc?: (id: string) => void;
  /** When a wiki link's target article doesn't exist yet, create one with the target title and open it */
  onCreateDoc?: (category: string, init: { title: string }) => void | Promise<void>;
}) {
  // Loading + autosave reuse the edit page's pipeline (works for both local and cloud docs)
  const { docVersion, loading, loggedIn, reload, refreshedHint } = useEditorDoc(docId);
  const t = useT();

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
  // Shared scroll container for title + body: state rather than ref, since it must re-render after mount to pass it to the editor
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  /** AI review mode: suggestions are marked directly on the editor body, so it only works in the normal edit view;
      entering split / reading mode exits it */
  const [reviewOn, setReviewOn] = useState(false);
  /** Whether the review settings panel is open: both the pill on the review bar and 「去设置模型」 (Set up model) in the suggestion column can open it */
  const [reviewSettingsOpen, setReviewSettingsOpen] = useState(false);
  const [reviewSummaryOpen, setReviewSummaryOpen] = useState(false);
  const exitReview = useCallback(() => {
    setReviewOn(false);
    setReviewSettingsOpen(false);
    setReviewSummaryOpen(false);
  }, []);
  const { mode, previewMounted, toggleSplit, openEdit, toggleReading } = useEditorViewMode(
    editorRef,
    scrollEl,
    exitReview
  );
  const split = mode === "split";
  const reading = mode === "read";
  // Selection reporting uses a subscription rather than state: setState on every cursor move would needlessly re-render the whole article view,
  // and the floating toolbar is just a side component mounted on body, so letting it subscribe to this stream is enough
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

  // [[Wiki links]]: the editor and preview only dispatch events; finding articles by title / asking whether to create one lives in this hook
  useWikiLinkOpen({
    docs: docs ?? [],
    category: category || UNCATEGORIZED,
    openDoc: onOpenDoc ?? (() => {}),
    createDoc: onCreateDoc ?? (() => {}),
  });

  // After renaming the title, also update `[[wiki links]]` elsewhere that point to this article (like Obsidian's rename updating references).
  // Refresh goes through the DOCS_CHANGED broadcast (sent automatically on DB writes, which useDocLibrary listens to), so no extra callback is needed
  const { onTitleFocus, onTitleBlur } = useRenameLinks({ docId, docs, title, docVersion });

  const applyFormat = useCallback((cmd: FormatCommand, arg?: string) => {
    editorRef.current?.applyFormat(cmd, arg);
  }, []);
  const { setActive, onEditorScrollLine, onPreviewScroll } = useSyncScroll(
    editorRef,
    previewRef
  );

  // Editor rebuild key: a change in docId or load batch means different content (scroll memory uses it to detect "switched docs")
  const docKey = `${docId}:${docVersion}`;

  // AI review: state, position mapping and acceptance all live in this hook, which invalidates and restarts itself on doc change
  const reviewApi = useReview({
    active: reviewOn,
    content,
    docKey,
    docId,
    editorRef,
    scrollEl,
  });
  /** Never give up body column width: add a suggestion column on the right if it fits, otherwise switch to popovers */
  const { showColumn } = useReviewLayout({ active: reviewOn, scrollEl });

  /** Starting review first returns to the normal edit view (annotations live on the editor). Which kind to review and with which model
      have already been chosen in the launch panel from the top bar button; this just starts the run */
  const { rerun: runNewReview, openRecord: loadReviewRecord } = reviewApi;
  const startReview = useCallback(() => {
    openEdit();
    runNewReview(); // if we were browsing history last time, switch back to "actually run one"
    setReviewOn(true);
  }, [openEdit, runNewReview]);
  /** Bring up a review history entry for viewing: doesn't call the model. Also used when already in review mode */
  const openReviewRecord = useCallback(
    (id: string) => {
      openEdit();
      loadReviewRecord(id);
      setReviewOn(true);
    },
    [openEdit, loadReviewRecord]
  );
  const openReviewSettings = useCallback(() => setReviewSettingsOpen(true), []);
  const openReviewSummary = useCallback(() => setReviewSummaryOpen(true), []);

  // Write the cover into frontmatter. The editor is uncontrolled, so it must change via its own transaction (which also makes it undoable),
  // replacing only the small segment outside the common prefix/suffix so the cursor and scroll position stay put
  const pickCover = (src: string | null) => {
    const view = editorRef.current?.view();
    const cur = view ? view.state.doc.toString() : useStore.getState().content;
    const next = setFrontmatterValue(cur, COVER_KEY, src);
    if (next === cur) return;
    if (!view) return setContent(next);
    let from = 0;
    while (from < cur.length && from < next.length && cur[from] === next[from]) from++;
    let tail = 0;
    while (tail < cur.length - from && tail < next.length - from && cur[cur.length - 1 - tail] === next[next.length - 1 - tail]) tail++;
    view.dispatch({ changes: { from, to: cur.length - tail, insert: next.slice(from, next.length - tail) } });
  };
  // Remember where each article was read to: switching away and back, or refreshing, returns to the same spot
  const recordScroll = useScrollMemory(docId, docKey, editorRef, scrollEl);
  // TOC highlighting uses a subscription: the top line number changes every frame, and lifting it to state would re-render the whole article view
  const { publish: publishTopLine, subscribe: subscribeTopLine } = useTopLineChannel();
  const onScrollLine = useCallback(
    (line: number, ratio: number) => {
      onEditorScrollLine(line, ratio); // split-view scroll sync
      recordScroll(line, ratio); // scroll memory
      publishTopLine(line); // current TOC section
    },
    [onEditorScrollLine, recordScroll, publishTopLine]
  );
  // On doc change, reset the top line to zero first: articles too short to scroll emit no scroll events and won't push a new line number,
  // and without the reset the TOC would still highlight the section reached in the previous article
  useEffect(() => {
    publishTopLine(0);
  }, [docKey, publishTopLine]);

  // Source/preview divider: while dragging only the local value updates, and the store is written on release;
  // splitRatio is a persisted field, so writing it every frame would flush localStorage hundreds of times per drag
  const splitDrag = useDragDivider<DOMRect | null>({
    start: () => splitAreaRef.current?.getBoundingClientRect() ?? null,
    move: (ev, rect) => {
      if (!rect || rect.width === 0) return undefined;
      // Clamp range matches setSplitRatio in the store: what's shown while dragging is exactly what will be saved
      return Math.min(0.75, Math.max(0.25, (ev.clientX - rect.left) / rect.width));
    },
    commit: setSplitRatio,
  });
  // Use the live value while dragging, and the store's value after release
  const shownRatio = splitDrag.value ?? splitRatio;

  /** The layout with body and suggestion column side by side (when it doesn't fit, only popovers remain and the layout is exactly as usual) */
  const pairColumn = reviewOn && showColumn;
  const titleCls = split
    ? "px-7"
    : pairColumn
      ? "max-w-[760px] px-7"
      : "mx-auto max-w-[760px] px-7";

  /** Move category: just update the store; persistence goes through the autosave pipeline (consistent for local/cloud/offline) */
  const moveToCategory = (c: string) => {
    if (c === (category || UNCATEGORIZED)) return;
    setCategory(c);
    onCategoryChange?.(c);
    toast(t("已移动到「{name}」", { name: c === UNCATEGORIZED ? t(c) : c }), "success");
  };

  const moveToNewCategory = async () => {
    const name = (
      await askInput({ title: t("新建文件夹并移入"), placeholder: t("文件夹名称，可用 / 建子文件夹") })
    )?.trim();
    if (!name) return;
    moveToCategory(name.slice(0, 100));
  };

  /** Categories can number in the hundreds with deep nesting, so open a searchable picker (same as the article list's context menu) */
  const pickCategory = async () => {
    const target = await askCategoryPick({
      title: t("移动到文件夹"),
      categories: categories ?? [],
      current: category || UNCATEGORIZED,
      createOption: t("新建文件夹并移入…"),
    });
    if (target === CREATE_CATEGORY) return void moveToNewCategory();
    if (target) moveToCategory(target);
  };

  /** Sharing requires login + a cloud doc; local drafts get a prompt first.
      The callbacks below are all wrapped in useCallback: ReaderActions is memoized, and a changed callback reference would defeat the memo */
  const openShare = useCallback(() => {
    if (!loggedIn || isLocalId(docId)) {
      toast(t("登录后才能分享文章"), "error");
      return;
    }
    setShareOpen(true);
  }, [loggedIn, docId, t]);
  const openOutline = useCallback(() => setOutlineOpen(true), []);
  const closeOutline = useCallback(() => setOutlineOpen(false), []);
  const openVersions = useCallback(() => setVersionsOpen(true), []);

  // Article-related commands in the command palette (⌘⇧P): format / view / article / copy & export.
  // Registered only while an article is open, and unmounted along with this component
  useReaderCommands({
    applyFormat,
    toggleSplit,
    toggleReading,
    openVersions,
    pickCategory: () => void pickCategory(),
    openShare,
    onDelete,
  });

  // Word count is rescanned only when the body changes (wordCount runs 4 regex passes internally, don't run it on every render).
  // Wrapped in useDeferredValue too: word count is "glance at it" info, so it renders at low priority,
  // letting the cursor and body paint first while typing, with the full-text scan deferred
  const deferredContent = useDeferredValue(content);
  const chars = useMemo(() => wordCount(deferredContent), [deferredContent]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-[13px] text-[var(--ink-faint)]">
        <Loader2 size={16} className="animate-spin" /> {t("加载中…")}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top action bar: insert / theme / versions / copy / split / read / more
          (portaled to the right of the breadcrumb top bar, sharing its row and saving a whole extra bar) */}
      {actionSlot
        ? createPortal(
            <ReaderActions
              empty={chars === 0}
              split={split}
              onToggleSplit={toggleSplit}
              review={reviewOn}
              docId={docId}
              onStartReview={startReview}
              onOpenReviewRecord={openReviewRecord}
              onExitReview={exitReview}
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

      {/* The reading view mounts separately and the editor always stays, so selection and undo history aren't lost. */}
      {reading ? <Preview variant="reading" onExit={toggleReading} /> : null}
      {/* Editing area (single pane by default) / split (source left + preview right) */}
      <div ref={splitAreaRef} className={`${reading ? "hidden" : "flex"} min-h-0 min-w-0 flex-1`}>
        {/* Source editing column */}
        <div
          className={`flex min-w-0 flex-col bg-[var(--panel)] ${
            splitDrag.dragging
              ? "" // disable the width transition while dragging, or the width animation lags behind the pointer
              : "transition-[width] duration-300 ease-[cubic-bezier(0.22,0.9,0.26,1)]"
          }`}
          style={{ width: split ? `${shownRatio * 100}%` : "100%" }}
          onPointerEnter={() => setActive("editor")}
        >
          <div className="flex min-h-0 flex-1">
            {/* Outline panel: opens/closes with a width transition; the panel itself is fixed-width so text doesn't squeeze as the width changes */}
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
                subscribeTopLine={subscribeTopLine}
              />
            </div>
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              {/* The AI review bar: placed outside the scroll area, so the body is pushed down by just its height and doesn't jump around with cards */}
              {reviewOn ? (
                <ReviewToolbar
                  phase={reviewApi.phase}
                  error={reviewApi.error}
                  total={reviewApi.total}
                  handled={reviewApi.handled}
                  categories={reviewApi.categories}
                  counts={reviewApi.counts}
                  filter={reviewApi.filter}
                  onFilter={reviewApi.setFilter}
                  onPrev={reviewApi.goPrev}
                  onNext={reviewApi.goNext}
                  canPrev={reviewApi.canPrev}
                  canNext={reviewApi.canNext}
                  onRerun={reviewApi.rerun}
                  onExit={exitReview}
                  summary={reviewApi.summary}
                  summaryOpen={reviewSummaryOpen}
                  onSummaryOpen={setReviewSummaryOpen}
                  settingsOpen={reviewSettingsOpen}
                  onSettingsOpen={setReviewSettingsOpen}
                  docId={docId}
                  record={reviewApi.record}
                  fromHistory={reviewApi.fromHistory}
                  onOpenRecord={reviewApi.openRecord}
                />
              ) : null}
              {/* Feishu-style TOC entry, tucked into the blank space at the body column's top-left; once expanded, the collapse button at the panel top takes over.
                  During review there's an extra bar above, so it has to move down accordingly */}
              {!outlineOpen ? (
                <button
                  type="button"
                  title={t("目录")}
                  aria-label={t("展开目录")}
                  onClick={openOutline}
                  className={`absolute left-1.5 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] ${
                    reviewOn ? "top-[74px]" : "top-[38px]"
                  }`}
                >
                  <AlignLeft size={16} />
                </button>
              ) : null}
              {/* Title area and body share one scroll container: the title scrolls out of view with the body,
                  so the body is no longer hard-cut below a fixed title. The editor itself is auto-height (.reader-live),
                  and scroll reading/writing is taken over by MarkdownEditor's scrollParent */}
              <div ref={setScrollEl} className="min-h-0 flex-1 overflow-y-auto">
                {/* During review, "title + body + suggestion column" is centered as a unit: the body column is still 760,
                    just shifted left by half a suggestion column. When not reviewing, this layer is display:contents, as if it weren't there */}
                <div
                  className={reviewOn ? "relative mx-auto w-full" : "contents"}
                  style={pairColumn ? { maxWidth: REVIEW_MIN_WIDTH } : undefined}
                >
                  {/* Title + metadata: left edge aligned with body text (28px = .cm-doc/.cm-split line padding) */}
                  {/* pt is 12px more than before: with the persistent toolbar removed, the title can't sit right against the breadcrumb's bottom edge */}
                  <div className={`w-full pt-8 ${titleCls}`}>
                    <input
                      className="w-full bg-transparent text-[27px] font-bold leading-[1.3] tracking-tight text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
                      value={title === UNTITLED_DOC ? t(UNTITLED_DOC) : title}
                      placeholder={t(UNTITLED_DOC)}
                      onChange={(e) => setTitle(e.target.value)}
                      onFocus={() => {
                        // Record the original before clearing the placeholder: the cleared "" shouldn't be taken as "what it was called before renaming"
                        onTitleFocus();
                        if (title === UNTITLED_DOC) setTitle("");
                      }}
                      onBlur={() => {
                        onTitleBlur();
                        if (!title.trim()) setTitle(UNTITLED_DOC);
                      }}
                    />
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--ink-faint)]">
                      {/* Deep category paths are long enough to crush the metadata row: show only the last segment, with the full path in the hover tooltip;
                          clicking opens the searchable category picker (same as the article list's context menu).
                          No background normally, same texture as the save status and word count on the same row; a light background appears on hover to hint it's clickable */}
                      <button
                        className="-ml-1 flex max-w-[260px] cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
                        title={`${t(category || UNCATEGORIZED)}\n${t("点击移动到文件夹")}`}
                        onClick={() => void pickCategory()}
                      >
                        <Folder size={12} className="shrink-0" />
                        <span className="truncate">
                          {category.includes("/")
                            ? `…/${category.split("/").pop()}`
                            : t(category || UNCATEGORIZED)}
                        </span>
                        <ChevronDown size={12} className="shrink-0 opacity-60" />
                      </button>
                      <span>·</span>
                      {/* After MCP / another device changes it and the page auto-refreshes, show a light hint in this cell for a few seconds then revert, no toast */}
                      {refreshedHint ? (
                        <span className="sync-hint flex items-center gap-1 text-[var(--accent)]">
                          <RefreshCw size={12} />
                          {t("已更新到最新版本")}
                        </span>
                      ) : (
                        <span>{SAVE_LABEL[saveState] ? t(SAVE_LABEL[saveState]) : saveState}</span>
                      )}
                      <span>·</span>
                      <span>{t("{n} 字", { n: chars, abs: chars })}</span>
                      <DocTimestamps meta={docs?.find((d) => d.id === docId)} />
                      <span>·</span>
                      <CoverPicker content={content} onPick={pickCover} />
                    </div>
                    <div className="mt-3 h-px w-10 bg-[var(--hairline-strong)]" />
                  </div>
                  {/* Markdown editor: live rendering by default (switchable to source mode in settings).
                      Single pane adds .cm-doc → body centered at a readable width; split adds .cm-split → fills the left column with larger line padding.
                      .reader-live makes the editor auto-height, with scrolling handled by the outer container above */}
                  <div
                    className={`w-full cm-reader reader-live ${split ? "cm-split" : "cm-doc"} ${
                      pairColumn ? "max-w-[760px]" : ""
                    }`}
                  >
                    <MarkdownEditor
                      key={docKey}
                      ref={editorRef}
                      docKey={docKey}
                      initialContent={useStore.getState().content}
                      live={!sourceMode}
                      docs={docs}
                      onChange={setContent}
                      onScrollLine={onScrollLine}
                      onSelectionChange={emitSelection}
                      scrollParent={scrollEl}
                    />
                  </div>
                  {/* Suggestions: a column on the right if it fits, otherwise only a popover for the selected one;
                      either way, hovering over an annotation pops up that suggestion in place */}
                  {reviewOn ? (
                    <>
                      {showColumn ? (
                        <ReviewCards
                          api={reviewApi}
                          onOpenSettings={openReviewSettings}
                          onOpenSummary={openReviewSummary}
                        />
                      ) : null}
                      <ReviewPopover api={reviewApi} pinActive={!showColumn} />
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Draggable divider + right-hand preview: on collapse, finish the width animation before unmounting */}
        {previewMounted ? (
          <>
            <div
              className="group relative z-10 w-[5px] shrink-0 cursor-col-resize border-l border-[var(--hairline-soft)] bg-[var(--panel)] hover:bg-[var(--accent-wash)]"
              onPointerDown={splitDrag.onPointerDown}
              title={t("拖动调整源码/预览宽度")}
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

      {/* Notion-style floating toolbar: appears only when body text is selected, portaled to body and fixed to follow the selection */}
      {!reading ? (
        <FloatingToolbar
          subscribe={subscribeSelection}
          editorRef={editorRef}
          scrollEl={scrollEl}
          onCommand={applyFormat}
        />
      ) : null}

      {/* Version history drawer: opened by the 「版本」 (Versions) button in the feature cluster */}
      <VersionsPanel
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        loggedIn={loggedIn}
        onRestored={reload}
      />

      {/* Share settings: public link + guest annotations */}
      {shareOpen ? <ShareDialog docId={docId} onClose={() => setShareOpen(false)} /> : null}
    </div>
  );
}
