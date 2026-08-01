"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, MessageSquarePlus, RotateCcw, Trash2, X } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { BASE_CSS } from "@/lib/themes/base";
import { getCodeThemeCss } from "@/lib/themes";
import {
  anchorFromSelection,
  clearHighlights,
  highlightRange,
  locateAnchor,
  type AnchorInput,
  type AnchorRange,
} from "./anchors";
import { Toaster, toast } from "@/components/Toast";
import { loadIdentity, saveIdentityName, type GuestIdentity } from "./identity";
import type { ShareCommentJson, SharePayload } from "./types";

/** 高亮与批注 UI 自身的样式（正文主题之外） */
const ANNO_CSS = `
#nice .xe-anno { background-color: rgba(250, 173, 20, 0.24); border-bottom: 2px solid rgba(224, 152, 8, 0.8); cursor: pointer; }
#nice .xe-anno-active { background-color: rgba(250, 173, 20, 0.45); }
`;

interface Thread {
  root: ShareCommentJson;
  replies: ShareCommentJson[];
  range: AnchorRange | null;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) +
    " " + d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

/** 距失效的剩余时长文案 */
function fmtRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "已失效";
  const hours = Math.floor(ms / 3600_000);
  if (hours >= 1) return `${hours} 小时后失效`;
  return `${Math.max(1, Math.floor(ms / 60_000))} 分钟后失效`;
}

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
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [selBtn, setSelBtn] = useState<{
    x: number; y: number; anchor: AnchorInput & AnchorRange;
  } | null>(null);
  const [composer, setComposer] = useState<{
    x: number; y: number; anchor: AnchorInput & AnchorRange;
  } | null>(null);
  const [guestName, setGuestName] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const identityRef = useRef<GuestIdentity | null>(null);
  const articleRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** 正文由我们手动写入 innerHTML（React 不管理其子树），高亮 span 才不会被重渲染抹掉 */
  const lastHtmlRef = useRef("");

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
      const range = locateAnchor(root, c);
      next.set(c.id, range);
      if (range && !c.resolvedAt) highlightRange(root, range, c.id);
    }
    setRanges(next);
  }, [html, comments]);

  // —— 激活态样式 ——
  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    for (const el of Array.from(root.querySelectorAll(".xe-anno-active"))) {
      el.classList.remove("xe-anno-active");
    }
    if (activeId) {
      for (const el of Array.from(root.querySelectorAll(`[data-anno="${activeId}"]`))) {
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
    const span = articleRef.current?.querySelector<HTMLElement>(`[data-anno="${id}"]`);
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

  const onArticleClick = useCallback(
    (e: React.MouseEvent) => {
      const span = (e.target as HTMLElement).closest<HTMLElement>(".xe-anno");
      if (span?.dataset.anno) {
        e.preventDefault();
        openThread(span.dataset.anno);
      }
    },
    [openThread]
  );

  // —— 提交批注 / 回复 ——
  const needName = !viewerIsOwner && !guestName.trim();
  const submit = useCallback(
    async (parentId: string | null, anchor?: AnchorInput) => {
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
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--hairline-soft)] bg-[var(--panel)] px-4">
        <Link href="/" className="text-[15px] font-bold tracking-tight text-[var(--ink)]">
          xedit
        </Link>
        <span className="text-[12px] text-[var(--ink-faint)]">文章分享</span>
        <span className="flex-1" />
        <span className="hidden text-[12px] text-[var(--ink-faint)] sm:block">
          {fmtRemaining(expiresAt)}
        </span>
        {allowComment ? (
          <span className="hidden rounded-full bg-[var(--accent-wash)] px-2.5 py-0.5 text-[12px] text-[var(--ink-soft)] sm:block">
            {openCount > 0 ? `${openCount} 条批注` : "选中文字即可批注"}
          </span>
        ) : null}
        <Link
          href="/"
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
        >
          用 xedit 写作
        </Link>
      </header>

      {/* 内容区（body 是 overflow-hidden，这里自建滚动） */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[820px] justify-center gap-8 px-4 py-8">
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
                onPointerUp={() => setTimeout(captureSelection, 0)}
                onKeyUp={() => setTimeout(captureSelection, 0)}
              >
                <section id="nice" ref={articleRef} />
              </div>
            </div>
            <p className="py-6 text-center text-[12px] text-[var(--ink-faint)]">
              本页由 xedit 生成 · 链接 48 小时内有效
              {allowComment ? " · 选中正文任意文字即可批注" : ""}
            </p>

            {/* 选中后的「批注」浮动按钮 */}
            {selBtn && !composer ? (
              <button
                className="absolute z-30 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--ink)] py-1.5 pl-2.5 pr-3 text-[12px] font-medium text-[var(--panel)] shadow-lg hover:opacity-90"
                style={{ left: selBtn.x, top: selBtn.y }}
                onPointerDown={(e) => e.preventDefault() /* 保住选区 */}
                onClick={() => {
                  // 位置在这里就钳好（渲染期不许读 ref）
                  const width = wrapRef.current?.clientWidth ?? 440;
                  setComposer({
                    ...selBtn,
                    x: Math.min(Math.max(8, selBtn.x - 150), width - 308),
                  });
                  setDraft("");
                  setActiveId(null);
                  setPanelPos(null);
                }}
              >
                <MessageSquarePlus size={13} />
                批注
              </button>
            ) : null}

            {/* 新批注编辑卡 */}
            {composer ? (
              <div
                className="absolute z-40 w-[300px] rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.16)]"
                style={{ left: composer.x, top: composer.y }}
              >
                <div className="mb-2 flex items-start gap-2">
                  <p className="min-w-0 flex-1 truncate border-l-2 border-amber-400 pl-2 text-[12px] text-[var(--ink-faint)]">
                    {composer.anchor.anchorText}
                  </p>
                  <button
                    className="cursor-pointer text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    onClick={() => setComposer(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
                {nameInput}
                <textarea
                  autoFocus
                  className="h-20 w-full resize-none rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-1.5 text-[13px] leading-relaxed text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
                  placeholder="写下批注…（⌘/Ctrl+Enter 提交）"
                  value={draft}
                  maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      void submit(null, composer.anchor);
                    }
                  }}
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    className="cursor-pointer rounded-md px-3 py-1.5 text-[12px] text-[var(--ink-soft)] hover:bg-[var(--paper)]"
                    onClick={() => setComposer(null)}
                  >
                    取消
                  </button>
                  <button
                    className="cursor-pointer rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-45"
                    disabled={!draft.trim() || (needName && !guestName.trim()) || busy}
                    onClick={() => void submit(null, composer.anchor)}
                  >
                    批注
                  </button>
                </div>
              </div>
            ) : null}

            {/* 线程面板：点高亮弹出 */}
            {activeThread && panelPos ? (
              <div
                className="absolute z-40 w-[308px] rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_12px_40px_rgba(0,0,0,0.16)]"
                style={{ left: panelPos.x, top: panelPos.y }}
              >
                <div className="flex items-center justify-between border-b border-[var(--hairline-soft)] px-3 py-2">
                  <p className="min-w-0 flex-1 truncate border-l-2 border-amber-400 pl-2 text-[12px] text-[var(--ink-faint)]">
                    {activeThread.root.anchorText}
                  </p>
                  <div className="ml-2 flex items-center gap-1">
                    {activeThread.root.mine && !activeThread.root.resolvedAt ? (
                      <button
                        className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[12px] text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        title="标记已解决"
                        onClick={() => void resolveThread(activeThread.root.id, true)}
                      >
                        <Check size={13} />
                        解决
                      </button>
                    ) : null}
                    <button
                      className="cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                      onClick={() => {
                        setActiveId(null);
                        setPanelPos(null);
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto px-3 py-2">
                  {[activeThread.root, ...activeThread.replies].map((c) => (
                    <div key={c.id} className="group py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-[var(--ink)]">
                          {c.author}
                        </span>
                        {c.isOwner ? (
                          <span className="rounded bg-[var(--accent-wash)] px-1 text-[10px] text-[var(--accent)]">
                            作者
                          </span>
                        ) : null}
                        <span className="text-[11px] text-[var(--ink-faint)]">
                          {fmtTime(c.createdAt)}
                        </span>
                        <span className="flex-1" />
                        {c.mine ? (
                          <button
                            className="hidden cursor-pointer text-[var(--ink-faint)] hover:text-red-500 group-hover:block"
                            title="删除"
                            onClick={() => void removeComment(c)}
                          >
                            <Trash2 size={12} />
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--ink)]">
                        {c.body}
                      </p>
                    </div>
                  ))}
                </div>
                {allowComment ? (
                  <div className="border-t border-[var(--hairline-soft)] p-2.5">
                    {nameInput}
                    <div className="flex items-end gap-2">
                      <textarea
                        className="h-9 min-h-9 flex-1 resize-none rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-1.5 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
                        placeholder="回复…"
                        value={draft}
                        maxLength={2000}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            void submit(activeThread.root.id);
                          }
                        }}
                      />
                      <button
                        className="cursor-pointer rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-45"
                        disabled={!draft.trim() || (needName && !guestName.trim()) || busy}
                        onClick={() => void submit(activeThread.root.id)}
                      >
                        回复
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* 批注侧栏（桌面） */}
          <aside className="hidden w-[280px] shrink-0 lg:block">
            <div className="sticky top-0 pt-1">
              <p className="mb-3 text-[12px] tracking-[0.15em] text-[var(--ink-faint)]">
                批注 {openCount > 0 ? `· ${openCount}` : ""}
              </p>
              {sortedThreads.open.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--hairline)] px-3 py-4 text-[12px] leading-relaxed text-[var(--ink-faint)]">
                  {allowComment
                    ? "还没有批注。选中正文任意文字，点「批注」即可发表意见。"
                    : "该分享未开放批注。"}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {sortedThreads.open.map((t) => (
                    <button
                      key={t.root.id}
                      className={`cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        activeId === t.root.id
                          ? "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20"
                          : "border-[var(--hairline)] bg-[var(--panel)] hover:border-amber-300"
                      }`}
                      onClick={() => openThread(t.root.id, true)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-[var(--ink)]">
                          {t.root.author}
                        </span>
                        <span className="text-[11px] text-[var(--ink-faint)]">
                          {fmtTime(t.root.createdAt)}
                        </span>
                        {!t.range ? (
                          <span className="rounded bg-[var(--paper)] px-1 text-[10px] text-[var(--ink-faint)]">
                            原文已修改
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate border-l-2 border-amber-400 pl-2 text-[11px] text-[var(--ink-faint)]">
                        {t.root.anchorText}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--ink-soft)]">
                        {t.root.body}
                      </p>
                      {t.replies.length > 0 ? (
                        <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
                          {t.replies.length} 条回复
                        </p>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}

              {sortedThreads.resolved.length > 0 ? (
                <>
                  <p className="mb-2 mt-5 text-[12px] tracking-[0.15em] text-[var(--ink-faint)]">
                    已解决 · {sortedThreads.resolved.length}
                  </p>
                  <div className="flex flex-col gap-2">
                    {sortedThreads.resolved.map((t) => (
                      <div
                        key={t.root.id}
                        className="rounded-lg border border-[var(--hairline-soft)] px-3 py-2 opacity-70"
                      >
                        <div className="flex items-center gap-2">
                          <Check size={12} className="text-emerald-600" />
                          <span className="text-[12px] text-[var(--ink-soft)]">{t.root.author}</span>
                          <span className="flex-1" />
                          {t.root.mine ? (
                            <button
                              className="flex cursor-pointer items-center gap-1 text-[11px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                              onClick={() => void resolveThread(t.root.id, false)}
                            >
                              <RotateCcw size={11} />
                              恢复
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-1 text-[12px] text-[var(--ink-faint)]">
                          {t.root.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
