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
import { useShareComments } from "./hooks/useShareComments";
import type { AnchorType, ShareCommentJson, SharePayload } from "./types";
import { ANNO_CSS } from "./lib/constants";
import { ArticleHeader } from "./components/ArticleHeader";
import { OutlineNav } from "./components/OutlineNav";
import { CommentSidebar } from "./components/CommentSidebar";
import { AnnotationOverlay } from "./components/AnnotationOverlay";

/** 待提交的批注锚点（文字选区或媒体） */
export interface PendingAnchor extends AnchorInput {
  type: AnchorType;
}

export interface Thread {
  root: ShareCommentJson;
  replies: ShareCommentJson[];
  range: AnchorRange | null;
}

/** 选区「批注」浮动按钮的位置与锚点 */
export type SelBtnState = { x: number; y: number; anchor: AnchorInput & AnchorRange } | null;
/** 媒体「批注」浮标的位置与锚点 */
export type MediaBtnState = { x: number; y: number; anchor: AnchorInput; video: boolean } | null;
/** 新批注编辑卡的位置与待提交锚点 */
export type ComposerState = { x: number; y: number; anchor: PendingAnchor } | null;
/** 线程面板的定位坐标 */
export type PanelPos = { x: number; y: number } | null;

export function SharedArticle(props: SharePayload) {
  const {
    token, title, authorName, updatedAt, content,
    themeCss, codeThemeId, customCss, macCode, allowComment, viewerIsOwner,
  } = props;

  // 阅读区宽度随批注开关走：关批注时右侧 280px 批注栏整条不渲染，
  // 省下的横向空间全给正文，读起来比原先的手机窄栏舒服得多
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
  const [outline, setOutline] = useState<{ level: number; text: string }[]>([]);

  /** 线程收起：解决或删除后，浮层与激活态一起清掉 */
  const closeThread = useCallback(() => {
    setActiveId(null);
    setPanelPos(null);
  }, []);

  /** 新批注发表成功：收掉编辑卡与选区按钮，把新线程点亮 */
  const onRootPosted = useCallback((id: string) => {
    setComposer(null);
    setSelBtn(null);
    setActiveId(id);
  }, []);

  // 批注的读写（身份、轮询、发表、解决、删除）全在这个 hook 里
  const {
    comments, guestName, setGuestName, draft, setDraft, busy,
    submit, resolveThread, removeComment,
  } = useShareComments({
    token,
    viewerIsOwner,
    initialComments: props.initialComments,
    activeId,
    onRootPosted,
    onThreadClosed: closeThread,
  });

  const articleRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** 正文由我们手动写入 innerHTML（React 不管理其子树），高亮 span 才不会被重渲染抹掉 */
  const lastHtmlRef = useRef("");
  /** 媒体「批注」浮标的延迟隐藏计时器（离开媒体→进入浮标之间留缓冲） */
  const mediaHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // —— 渲染正文（与编辑器预览完全同一条管线，DOMPurify 消毒后才入 DOM） ——
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

  // —— 线程组装 ——
  const threads = useMemo<Thread[]>(() => {
    const roots = comments.filter((c) => !c.parentId);
    return roots.map((root) => ({
      root,
      replies: comments.filter((c) => c.parentId === root.id),
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

  // —— 正文写入 + 高亮铺设：正文或批注变化时整体重铺 ——
  // html 经 DOMPurify 消毒后才写入；不用 dangerouslySetInnerHTML 是因为
  // React 重渲染会把它重置，手动铺的高亮 span 会被抹掉。
  useEffect(() => {
    const root = articleRef.current;
    if (!root || !html) return;
    if (lastHtmlRef.current !== html) {
      root.innerHTML = html;
      lastHtmlRef.current = html;
    } else {
      clearHighlights(root);
    }
    const next = new Map<string, AnchorRange | null>();
    for (const c of comments) {
      if (c.parentId) continue;
      if (c.anchorType === "media") {
        const el = locateMedia(root, c);
        if (el) {
          const off = textOffsetBefore(root, el);
          next.set(c.id, { start: off, end: off });
          // 关批注后正文不再露出任何批注痕迹：既没有侧栏也点不开线程，
          // 高亮留着只会变成读者点不动的怪框
          if (!c.resolvedAt && allowComment) markMedia(el, c.id);
        } else {
          next.set(c.id, null);
        }
        continue;
      }
      const range = locateAnchor(root, c);
      next.set(c.id, range);
      if (range && !c.resolvedAt && allowComment) highlightRange(root, range, c.id);
    }
    setRanges(next);
  }, [html, comments, allowComment]);

  // —— 大纲：正文变化时从渲染结果里提取 h1~h3 ——
  // 声明在正文写入 effect 之后：同一次 html 变更的提交里，先写正文再提取
  useEffect(() => {
    const root = articleRef.current;
    if (!root || !html) return;
    setOutline(
      Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3")).map((h) => ({
        level: Number(h.tagName.slice(1)),
        text: h.textContent?.trim() ?? "",
      }))
    );
  }, [html]);

  const jumpToHeading = useCallback((index: number) => {
    const headings = articleRef.current?.querySelectorAll<HTMLElement>("h1, h2, h3");
    headings?.[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // —— 激活态样式 ——
  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    for (const el of Array.from(root.querySelectorAll(".xe-anno-active"))) {
      el.classList.remove("xe-anno-active");
    }
    if (activeId) {
      // ~= 按空格分词匹配：媒体元素可能挂多条批注 id
      for (const el of Array.from(root.querySelectorAll(`[data-anno~="${activeId}"]`))) {
        el.classList.add("xe-anno-active");
      }
    }
  }, [activeId, html, comments]);

  // —— 选区 → 批注按钮 ——
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

  // —— 打开线程面板（点高亮或侧栏卡片） ——
  const openThread = useCallback((id: string, scrollTo = false) => {
    const wrap = wrapRef.current;
    const span = articleRef.current?.querySelector<HTMLElement>(`[data-anno~="${id}"]`);
    setActiveId(id);
    setDraft("");
    if (span && wrap) {
      if (scrollTo) span.scrollIntoView({ behavior: "smooth", block: "center" });
      const rect = span.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      setPanelPos({
        x: Math.min(Math.max(8, rect.left - wrapRect.left), wrap.clientWidth - 316),
        y: rect.bottom - wrapRect.top + 8,
      });
    } else {
      setPanelPos(null); // 失效/已解决批注：无高亮，仅侧栏展开
    }
  }, [setDraft]);

  // —— 媒体「批注」浮标的显示与延迟隐藏 ——
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
      // 视频点击留给播放控件，已有批注经浮标或侧栏打开；图片与文字高亮点击直达
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

  // —— 访客署名 ——
  const needName = !viewerIsOwner && !guestName.trim();

  const activeThread = threads.find((t) => t.root.id === activeId) ?? null;
  const openCount = sortedThreads.open.length;

  // —— 访客署名输入（批注与回复共用） ——
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

      {/* 顶栏 */}
      <ArticleHeader allowComment={allowComment} openCount={openCount} />

      {/* 内容区（body 是 overflow-hidden，这里自建滚动） */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto flex ${layout.page} justify-center gap-8 px-4 py-8`}>
          {/* 大纲（桌面）：从渲染结果提取 h1~h3，点击平滑跳转 */}
          {outline.length > 0 ? <OutlineNav outline={outline} onJump={jumpToHeading} /> : null}
          {/* 文章列：宽度见 layout —— 批注开着让位给侧栏，关着则放宽 */}
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
            {/* 落款：整条可点，回 xedit 首页。href 用相对路径，
                自部署或 Mac 客户端下也不会把读者甩到别的域名去 */}
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
              selBtn={selBtn}
              mediaBtn={mediaBtn}
              composer={composer}
              setComposer={setComposer}
              setMediaBtn={setMediaBtn}
              cancelMediaHide={cancelMediaHide}
              scheduleMediaHide={scheduleMediaHide}
              setDraft={setDraft}
              setActiveId={setActiveId}
              setPanelPos={setPanelPos}
              draft={draft}
              guestName={guestName}
              busy={busy}
              needName={needName}
              nameInput={nameInput}
              submit={submit}
              activeThread={activeThread}
              panelPos={panelPos}
              resolveThread={resolveThread}
              removeComment={removeComment}
              allowComment={allowComment}
            />
          </div>

          {/* 批注侧栏（桌面）：关批注时整条不渲染，把宽度让给正文 */}
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
