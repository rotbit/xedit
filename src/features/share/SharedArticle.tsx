"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Toaster, toast } from "@/components/Toast";
import { loadIdentity, saveIdentityName, type GuestIdentity } from "./identity";
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
    token, title, authorName, updatedAt, expiresAt, content,
    themeCss, codeThemeId, customCss, macCode, allowComment, viewerIsOwner,
  } = props;

  const [comments, setComments] = useState<ShareCommentJson[]>(props.initialComments);
  const [html, setHtml] = useState("");
  const [codeCss, setCodeCss] = useState("");
  const [mathReady, setMathReady] = useState(false);
  const [ranges, setRanges] = useState<Map<string, AnchorRange | null>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState<PanelPos>(null);
  const [selBtn, setSelBtn] = useState<SelBtnState>(null);
  const [mediaBtn, setMediaBtn] = useState<MediaBtnState>(null);
  const [composer, setComposer] = useState<ComposerState>(null);
  const [guestName, setGuestName] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [outline, setOutline] = useState<{ level: number; text: string }[]>([]);

  const identityRef = useRef<GuestIdentity | null>(null);
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

  // —— 访客身份与批注刷新 ——
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/share/${token}/comments`, {
        headers: identityRef.current ? { "x-guest-key": identityRef.current.key } : {},
      });
      if (res.ok) setComments(await res.json());
    } catch {
      // 网络失败保持现状，下轮再试
    }
  }, [token]);

  useEffect(() => {
    identityRef.current = loadIdentity();
    setGuestName(identityRef.current.name);
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

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
          if (!c.resolvedAt) markMedia(el, c.id);
        } else {
          next.set(c.id, null);
        }
        continue;
      }
      const range = locateAnchor(root, c);
      next.set(c.id, range);
      if (range && !c.resolvedAt) highlightRange(root, range, c.id);
    }
    setRanges(next);
  }, [html, comments]);

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
  }, []);

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

  // —— 提交批注 / 回复 ——
  const needName = !viewerIsOwner && !guestName.trim();
  const submit = useCallback(
    async (parentId: string | null, anchor?: PendingAnchor) => {
      const body = draft.trim();
      if (!body || busy) return;
      setBusy(true);
      try {
        const name = guestName.trim().slice(0, 30);
        if (!viewerIsOwner && name) saveIdentityName(name);
        const res = await fetch(`/api/share/${token}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body,
            author: name,
            key: identityRef.current?.key ?? "",
            parentId,
            ...(anchor
              ? {
                  anchorType: anchor.type,
                  anchorText: anchor.anchorText,
                  anchorPrefix: anchor.anchorPrefix,
                  anchorIndex: anchor.anchorIndex,
                }
              : {}),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast(data.error ?? "批注失败，请稍后再试", "error");
          return;
        }
        const created: ShareCommentJson = await res.json();
        setComments((prev) => [...prev, created]);
        setDraft("");
        if (!parentId) {
          setComposer(null);
          setSelBtn(null);
          window.getSelection()?.removeAllRanges();
          setActiveId(created.id);
        }
      } finally {
        setBusy(false);
      }
    },
    [draft, busy, guestName, viewerIsOwner, token]
  );

  const resolveThread = useCallback(
    async (id: string, resolved: boolean) => {
      const res = await fetch(`/api/share/${token}/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved, key: identityRef.current?.key ?? "" }),
      });
      if (res.ok) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === id ? { ...c, resolvedAt: resolved ? new Date().toISOString() : null } : c
          )
        );
        if (resolved) {
          setActiveId(null);
          setPanelPos(null);
        }
      }
    },
    [token]
  );

  const removeComment = useCallback(
    async (c: ShareCommentJson) => {
      const res = await fetch(`/api/share/${token}/comments/${c.id}`, {
        method: "DELETE",
        headers: identityRef.current ? { "x-guest-key": identityRef.current.key } : {},
      });
      if (res.ok) {
        setComments((prev) => prev.filter((x) => x.id !== c.id && x.parentId !== c.id));
        if (activeId === c.id) {
          setActiveId(null);
          setPanelPos(null);
        }
      }
    },
    [token, activeId]
  );

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
      <ArticleHeader expiresAt={expiresAt} allowComment={allowComment} openCount={openCount} />

      {/* 内容区（body 是 overflow-hidden，这里自建滚动） */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1060px] justify-center gap-8 px-4 py-8">
          {/* 大纲（桌面）：从渲染结果提取 h1~h3，点击平滑跳转 */}
          {outline.length > 0 ? <OutlineNav outline={outline} onJump={jumpToHeading} /> : null}
          {/* 文章列：与编辑器预览一致的手机阅读宽度 */}
          <div ref={wrapRef} className="relative w-full max-w-[440px]">
            <div className="light-lock rounded-xl bg-white px-2.5 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_30px_rgba(0,0,0,0.04)]">
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
            <p className="py-6 text-center text-[12px] text-[var(--ink-faint)]">
              本页由 xedit 生成 · 链接 48 小时内有效
              {allowComment ? " · 选中文字或点击图片、视频即可批注" : ""}
            </p>

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

          {/* 批注侧栏（桌面） */}
          <CommentSidebar
            allowComment={allowComment}
            openCount={openCount}
            sortedThreads={sortedThreads}
            activeId={activeId}
            openThread={openThread}
            resolveThread={resolveThread}
          />
        </div>
      </div>
    </div>
  );
}
