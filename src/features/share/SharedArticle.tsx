"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { BASE_CSS } from "@/lib/themes/base";
import { getCodeThemeCss } from "@/lib/themes";
import {
  anchorFromSelection,
  clearHighlights,
  highlightRange,
  isMediaTarget,
  locateAnchor,
  locateMedia,
  markMedia,
  mediaAnchor,
  textOffsetBefore,
  type AnchorInput,
  type AnchorRange,
} from "./anchors";
import { Toaster } from "@/components/Toast";
import { OutlineNav } from "@/components/OutlineNav";
import { useOutline } from "@/hooks/useOutline";
import { useShareComments } from "./hooks/useShareComments";
import type { AnchorType, ShareCommentJson, SharePayload } from "./types";
import { ANNO_CSS } from "./lib/constants";
import { ArticleHeader } from "./components/ArticleHeader";
import { CommentSidebar } from "./components/CommentSidebar";
import { AnnotationOverlay } from "./components/AnnotationOverlay";

/** Anchor for an annotation about to be posted (text selection or media) */
export interface PendingAnchor extends AnchorInput {
  type: AnchorType;
}

export interface Thread {
  root: ShareCommentJson;
  replies: ShareCommentJson[];
  range: AnchorRange | null;
}

/** Position and anchor of the floating 「批注」 (Annotate) button for selections */
export type SelBtnState = { x: number; y: number; anchor: AnchorInput & AnchorRange } | null;
/** Position and anchor of the 「批注」 badge for media */
export type MediaBtnState = { x: number; y: number; anchor: AnchorInput; video: boolean } | null;
/** Position and pending anchor of the new-annotation card */
export type ComposerState = { x: number; y: number; anchor: PendingAnchor } | null;
/** Position of the thread panel */
export type PanelPos = { x: number; y: number } | null;

export function SharedArticle(props: SharePayload) {
  const {
    token, title, authorName, updatedAt, content,
    themeCss, codeThemeId, customCss, macCode, allowComment, viewerIsOwner,
  } = props;

  // Reading width follows the annotation toggle: with annotations off the 280px annotation column on the right isn't rendered at all,
  // and the freed horizontal space all goes to the body, far more comfortable than the old phone-narrow column
  const layout = allowComment
    ? { page: "max-w-[1160px]", column: "max-w-[620px]", pad: "px-4" }
    : { page: "max-w-[1010px]", column: "max-w-[780px]", pad: "px-6" };

  const [html, setHtml] = useState("");
  const [codeCss, setCodeCss] = useState("");
  const [mathReady, setMathReady] = useState(false);
  const [ranges, setRanges] = useState<Map<string, AnchorRange | null>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState<PanelPos>(null);
  const [selBtn, setSelBtn] = useState<SelBtnState>(null);
  const [mediaBtn, setMediaBtn] = useState<MediaBtnState>(null);
  const [composer, setComposer] = useState<ComposerState>(null);

  /** Close the thread: after resolve or delete, clear the popover and active state together */
  const closeThread = useCallback(() => {
    setActiveId(null);
    setPanelPos(null);
  }, []);

  /** New annotation posted: dismiss the card and selection button, and highlight the new thread */
  const onRootPosted = useCallback((id: string) => {
    setComposer(null);
    setSelBtn(null);
    setActiveId(id);
  }, []);

  // All annotation reads/writes (identity, polling, posting, resolving, deleting) live in this hook
  const {
    comments, guestName, setGuestName, busy,
    submit, resolveThread, removeComment,
  } = useShareComments({
    token,
    viewerIsOwner,
    initialComments: props.initialComments,
    activeId,
    // If the new-annotation card or thread panel is open the reader is interacting, so don't swap the list this polling round
    overlayOpen: composer !== null || activeId !== null,
    onRootPosted,
    onThreadClosed: closeThread,
  });

  const articleRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** We write the body into innerHTML by hand (React doesn't manage its subtree), so highlight spans aren't wiped by re-renders */
  const lastHtmlRef = useRef("");
  /** Delayed-hide timer for the media 「批注」 badge (a buffer between leaving the media and entering the badge) */
  const mediaHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // —— Render the body (exactly the same pipeline as the editor preview; sanitized by DOMPurify before entering the DOM) ——
  const mayHaveMath = content.includes("$");
  useEffect(() => {
    if (!mayHaveMath) return;
    void ensureMathJax().then(() => setMathReady(true));
  }, [mayHaveMath]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setHtml(sanitizeHtml(renderMarkdown(content, { macCode })));
    }, 0);
    return () => clearTimeout(timer);
  }, [content, macCode, mathReady]);
  useEffect(() => {
    let cancelled = false;
    void getCodeThemeCss(codeThemeId).then((css) => {
      if (!cancelled) setCodeCss(css);
    });
    return () => { cancelled = true; };
  }, [codeThemeId]);

  // —— Assemble threads ——
  const threads = useMemo<Thread[]>(() => {
    // Bucket replies by parentId once up front: previously each root annotation filtered the whole list,
    // which is O(annotations²); a popular article with hundreds of annotations would waste a full pass on every 30s poll
    const byParent = new Map<string, ShareCommentJson[]>();
    for (const c of comments) {
      if (!c.parentId) continue;
      const list = byParent.get(c.parentId);
      if (list) list.push(c);
      else byParent.set(c.parentId, [c]);
    }
    return comments
      .filter((c) => !c.parentId)
      .map((root) => ({
        root,
        replies: byParent.get(root.id) ?? [],
        range: ranges.get(root.id) ?? null,
      }));
  }, [comments, ranges]);

  const sortedThreads = useMemo(() => {
    const open = threads.filter((t) => !t.root.resolvedAt);
    const resolved = threads.filter((t) => t.root.resolvedAt);
    const byPos = (a: Thread, b: Thread) =>
      (a.range?.start ?? Number.MAX_SAFE_INTEGER) - (b.range?.start ?? Number.MAX_SAFE_INTEGER);
    return { open: open.sort(byPos), resolved: resolved.sort(byPos) };
  }, [threads]);

  // —— Write the body + lay highlights: re-lay everything when the body or annotations change ——
  // html is written only after DOMPurify sanitizes it; we don't use dangerouslySetInnerHTML because
  // React re-renders reset it, wiping the manually laid highlight spans.
  useEffect(() => {
    const root = articleRef.current;
    if (!root || !html) return;
    if (lastHtmlRef.current !== html) {
      root.innerHTML = html;
      lastHtmlRef.current = html;
    } else {
      clearHighlights(root);
    }
    // Take the full plain text once outside the loop: locateAnchor searches the whole text for every annotation,
    // and letting it read root.textContent itself would be O(annotations × body length).
    // highlightRange/markMedia below only split text nodes and add spans without changing the text,
    // so this snapshot stays valid for the whole pass.
    const fullText = root.textContent ?? "";
    const next = new Map<string, AnchorRange | null>();
    for (const c of comments) {
      if (c.parentId) continue;
      if (c.anchorType === "media") {
        const el = locateMedia(root, c);
        if (el) {
          const off = textOffsetBefore(root, el);
          next.set(c.id, { start: off, end: off });
          // With annotations off, the body shows no trace of them: there's no sidebar and threads can't be opened,
          // so leftover highlights would just be odd boxes readers can't click
          if (!c.resolvedAt && allowComment) markMedia(el, c.id);
        } else {
          next.set(c.id, null);
        }
        continue;
      }
      const range = locateAnchor(fullText, c);
      next.set(c.id, range);
      if (range && !c.resolvedAt && allowComment) highlightRange(root, range, c.id);
    }
    setRanges(next);
  }, [html, comments, allowComment]);

  // —— Outline: extract h1~h3 from the rendered output when the body changes ——
  // Declared after the body-writing effect: within one html-change commit, write the body first, then extract
  const { outline, jumpToHeading } = useOutline(articleRef, html);

  // —— Active state styles ——
  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    for (const el of Array.from(root.querySelectorAll(".xe-anno-active"))) {
      el.classList.remove("xe-anno-active");
    }
    if (activeId) {
      // ~= matches space-separated tokens: a media element may carry several annotation ids
      for (const el of Array.from(root.querySelectorAll(`[data-anno~="${activeId}"]`))) {
        el.classList.add("xe-anno-active");
      }
    }
  }, [activeId, html, comments]);

  // —— Selection → annotate button ——
  const captureSelection = useCallback(() => {
    if (!allowComment) return;
    const root = articleRef.current;
    const wrap = wrapRef.current;
    const sel = window.getSelection();
    if (!root || !wrap || !sel) return;
    const anchor = sel.rangeCount ? anchorFromSelection(root, sel) : null;
    if (!anchor) {
      setSelBtn(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    setSelBtn({
      x: rect.left + rect.width / 2 - wrapRect.left,
      y: rect.bottom - wrapRect.top + 8,
      anchor,
    });
  }, [allowComment]);

  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) setSelBtn(null);
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, []);

  // —— Open the thread panel (click a highlight or a sidebar card) ——
  const openThread = useCallback((id: string, scrollTo = false) => {
    const wrap = wrapRef.current;
    const span = articleRef.current?.querySelector<HTMLElement>(`[data-anno~="${id}"]`);
    setActiveId(id);
    if (span && wrap) {
      if (scrollTo) span.scrollIntoView({ behavior: "smooth", block: "center" });
      const rect = span.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      setPanelPos({
        x: Math.min(Math.max(8, rect.left - wrapRect.left), wrap.clientWidth - 316),
        y: rect.bottom - wrapRect.top + 8,
      });
    } else {
      setPanelPos(null); // Stale/resolved annotation: no highlight, only expand in the sidebar
    }
  }, []);

  // —— Show and delayed-hide of the media 「批注」 badge ——
  const cancelMediaHide = useCallback(() => {
    if (mediaHideTimer.current) {
      clearTimeout(mediaHideTimer.current);
      mediaHideTimer.current = null;
    }
  }, []);
  const scheduleMediaHide = useCallback(() => {
    cancelMediaHide();
    mediaHideTimer.current = setTimeout(() => setMediaBtn(null), 250);
  }, [cancelMediaHide]);

  const showMediaBtn = useCallback(
    (el: HTMLElement) => {
      const root = articleRef.current;
      const wrap = wrapRef.current;
      if (!root || !wrap) return;
      cancelMediaHide();
      const rect = el.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      setMediaBtn({
        x: rect.right - wrapRect.left - 8,
        y: rect.top - wrapRect.top + 8,
        anchor: mediaAnchor(root, el),
        video: el.tagName === "VIDEO",
      });
    },
    [cancelMediaHide]
  );

  const onArticlePointerOver = useCallback(
    (e: React.PointerEvent) => {
      if (!allowComment || composer) return;
      const media = (e.target as HTMLElement).closest("img, video");
      if (media && isMediaTarget(media)) showMediaBtn(media);
      else scheduleMediaHide();
    },
    [allowComment, composer, showMediaBtn, scheduleMediaHide]
  );

  const onArticleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const marked = target.closest<HTMLElement>("[data-anno]");
      // Video clicks go to the player controls; existing annotations open via the badge or sidebar. Image and text highlight clicks open directly
      if (marked?.dataset.anno && marked.tagName !== "VIDEO") {
        e.preventDefault();
        const ids = marked.dataset.anno.split(" ");
        const firstOpen = ids.find((id) =>
          comments.some((c) => c.id === id && !c.resolvedAt)
        );
        openThread(firstOpen ?? ids[0]);
      }
    },
    [openThread, comments]
  );

  // —— Visitor signature ——
  const needName = !viewerIsOwner && !guestName.trim();

  const activeThread = threads.find((t) => t.root.id === activeId) ?? null;
  const openCount = sortedThreads.open.length;

  // —— Visitor signature input (shared by annotations and replies) ——
  const nameInput = needName ? (
    <input
      className="mb-2 w-full rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-1.5 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
      placeholder="你的昵称（必填）"
      value={guestName}
      maxLength={30}
      onChange={(e) => setGuestName(e.target.value)}
    />
  ) : null;

  return (
    <div className="flex h-full flex-col bg-[var(--paper)]">
      <Toaster />
      <style>{BASE_CSS}</style>
      <style>{codeCss}</style>
      <style>{themeCss}</style>
      {customCss ? <style>{customCss}</style> : null}
      <style>{ANNO_CSS}</style>

      {/* Top bar */}
      <ArticleHeader allowComment={allowComment} openCount={openCount} />

      {/* Content area (body is overflow-hidden, so we scroll here) */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto flex ${layout.page} justify-center gap-8 px-4 py-8`}>
          {/* Outline (desktop): extracts h1~h3 from the rendered output, click to smooth-scroll */}
          {outline.length > 0 ? <OutlineNav outline={outline} onJump={jumpToHeading} /> : null}
          {/* Article column: width per layout; makes room for the sidebar when annotations are on, wider when off */}
          <div ref={wrapRef} className={`relative w-full ${layout.column}`}>
            <div
              className={`light-lock rounded-xl bg-white ${layout.pad} py-6 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_30px_rgba(0,0,0,0.04)]`}
            >
              <div className="px-4">
                <h1 className="text-[22px] font-bold leading-[1.4] text-[#1a1a1a] [font-family:var(--serif)]">
                  {title}
                </h1>
                <p className="mb-1 mt-2 text-[13px] text-[#999999]">
                  {authorName}
                  <span className="mx-2">·</span>
                  {new Date(updatedAt).toLocaleDateString("zh-CN")} 更新
                </p>
              </div>
              <div
                onClick={onArticleClick}
                onPointerOver={onArticlePointerOver}
                onPointerUp={() => setTimeout(captureSelection, 0)}
                onKeyUp={() => setTimeout(captureSelection, 0)}
              >
                <section id="nice" ref={articleRef} />
              </div>
            </div>
            {/* Footer credit: the whole line is clickable and goes to the xedit home page. href is relative,
                so self-hosted or Mac app readers aren't sent off to another domain */}
            <div className="py-6 text-center text-[12px] leading-relaxed text-[var(--ink-faint)]">
              <Link href="/" className="hover:text-[var(--accent)] hover:underline">
                本页由 xedit 生成 · xedit.me
              </Link>
              {allowComment ? (
                <p className="mt-1">选中文字或点击图片、视频即可批注</p>
              ) : null}
            </div>

            <AnnotationOverlay
              wrapRef={wrapRef}
              selection={{ selBtn, mediaBtn, composer }}
              thread={{ active: activeThread, pos: panelPos }}
              handlers={{
                setComposer,
                setMediaBtn,
                setActiveId,
                setPanelPos,
                cancelMediaHide,
                scheduleMediaHide,
                submit,
                resolveThread,
                removeComment,
              }}
              compose={{ guestName, busy, needName, nameInput }}
              allowComment={allowComment}
            />
          </div>

          {/* Annotation sidebar (desktop): not rendered when annotations are off, giving the width to the body */}
          {allowComment ? (
            <CommentSidebar
              openCount={openCount}
              sortedThreads={sortedThreads}
              activeId={activeId}
              openThread={openThread}
              resolveThread={resolveThread}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
