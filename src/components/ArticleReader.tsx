"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PenLine, Folder, ChevronRight } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { BASE_CSS } from "@/lib/themes/base";
import { getTheme, getCodeThemeCss, buildTuneCss } from "@/lib/themes";
import { useStore } from "@/store/useStore";

interface Doc {
  id: string;
  title: string;
  category: string;
  content: string;
  updatedAt: string;
}

/** 首页右侧的文章阅读视图：按当前主题渲染，只读 */
export function ArticleReader({
  docId,
  onOpenCategory,
}: {
  docId: string;
  onOpenCategory: (path: string) => void;
}) {
  const router = useRouter();
  const themeId = useStore((s) => s.themeId);
  const codeThemeId = useStore((s) => s.codeThemeId);
  const customCss = useStore((s) => s.customCss);
  const tuneFontSize = useStore((s) => s.tuneFontSize);
  const tuneLineHeight = useStore((s) => s.tuneLineHeight);
  const tuneParaSpacing = useStore((s) => s.tuneParaSpacing);

  const [doc, setDoc] = useState<Doc | null>(null);
  // html 由 renderMarkdown 产出并统一经 sanitizeHtml（DOMPurify）消毒
  const [html, setHtml] = useState("");
  const [codeCss, setCodeCss] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [res] = await Promise.all([
        fetch(`/api/documents/${docId}`),
        ensureMathJax(),
        getCodeThemeCss(useStore.getState().codeThemeId).then((css) => {
          if (!cancelled) setCodeCss(css);
        }),
      ]);
      if (cancelled) return;
      if (!res.ok) {
        setError("文章加载失败");
        return;
      }
      const d: Doc = await res.json();
      if (cancelled) return;
      setDoc(d);
      setHtml(sanitizeHtml(renderMarkdown(d.content, { macCode: useStore.getState().macCode })));
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const theme = getTheme(themeId);
  void codeThemeId;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--hairline-strong)] py-16 text-[13px] text-[var(--ink-faint)]">
        {error}
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-[var(--ink-faint)]">
        <Loader2 size={16} className="animate-spin" /> 加载中…
      </div>
    );
  }

  const chars = doc.content.replace(/\s/g, "").length;

  return (
    <div className="rise">
      {/* 面包屑 + 操作 */}
      <div className="flex items-center gap-1.5 pb-3">
        <button
          className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-[var(--ink-soft)] hover:bg-[var(--panel)] hover:text-[var(--accent-deep)]"
          onClick={() => onOpenCategory(doc.category || "未分类")}
        >
          <Folder size={13} />
          {doc.category || "未分类"}
        </button>
        <ChevronRight size={13} className="text-[var(--ink-faint)]" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink)]">
          {doc.title || "未命名文章"}
        </span>
        <span className="shrink-0 text-[11.5px] text-[var(--ink-faint)]">{chars} 字</span>
        <button
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 text-[12.5px] font-medium text-white shadow-[0_1px_4px_rgba(192,57,43,0.35)] hover:bg-[var(--accent-deep)]"
          onClick={() => router.push(`/edit/${doc.id}`)}
        >
          <PenLine size={13} />
          编辑此文
        </button>
      </div>

      {/* 渲染内容（已消毒） */}
      <div className="light-lock overflow-hidden rounded-xl bg-white shadow-[0_2px_16px_rgba(60,50,30,0.08)] ring-1 ring-[var(--hairline)]">
        <style>{BASE_CSS}</style>
        <style>{codeCss}</style>
        <style>{theme.css}</style>
        <style>{buildTuneCss({ tuneFontSize, tuneLineHeight, tuneParaSpacing })}</style>
        {customCss ? <style>{customCss}</style> : null}
        <section id="nice" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
