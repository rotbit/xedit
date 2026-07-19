"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  PenLine,
  Folder,
  Copy,
  MoreHorizontal,
  Download,
  Trash2,
} from "lucide-react";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { buildWechatHtml } from "@/lib/copy/wechat";
import { copyRichHtml } from "@/lib/copy/clipboard";
import { exportMarkdown } from "@/lib/export";
import { toast } from "./Toast";
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

/** 正文 Markdown 若以与文档标题同名的 #/## 标题开头，阅读态跳过该行：页面已有大标题，避免上下双标题 */
function stripLeadingTitle(md: string, title: string): string {
  const t = title.trim();
  if (!t) return md;
  const lines = md.split("\n");
  const i = lines.findIndex((l) => l.trim() !== "");
  if (i >= 0) {
    const h = lines[i].match(/^#{1,2}\s+(.*?)\s*#*\s*$/);
    if (h && h[1].trim() === t) {
      lines.splice(i, 1);
      return lines.join("\n");
    }
  }
  return md;
}

/** 首页右侧的文章阅读视图：按当前主题渲染，只读 */
export function ArticleReader({
  docId,
  onOpenCategory,
  onDelete,
}: {
  docId: string;
  onOpenCategory: (path: string) => void;
  onDelete?: () => void;
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
  const [copying, setCopying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
      setHtml(
        sanitizeHtml(
          renderMarkdown(stripLeadingTitle(d.content, d.title), {
            macCode: useStore.getState().macCode,
          })
        )
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const theme = getTheme(themeId);
  void codeThemeId;

  /** 阅读态直接复制到公众号，与编辑器的复制管线一致 */
  const copyWechat = async () => {
    if (!doc || copying) return;
    setCopying(true);
    try {
      const s = useStore.getState();
      const html2 = await buildWechatHtml(doc.content, {
        themeCss: getTheme(s.themeId).css,
        codeCss: await getCodeThemeCss(s.codeThemeId),
        customCss: `${buildTuneCss(s)}\n${s.customCss}`.trim(),
        macCode: s.macCode,
        linkFootnote: s.linkFootnote,
      });
      await copyRichHtml(html2, doc.content);
      toast("已复制！打开公众号后台编辑器直接粘贴", "success");
    } catch (e) {
      toast(`复制失败：${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setCopying(false);
    }
  };

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
    <div>
      {/* 操作栏：sticky 顶置，滚动时保持可达；面包屑只保留内容区顶栏一处。
          不加入场动画：内部 ··· 菜单的 fixed 遮罩需以视口为参照 */}
      <div className="sticky top-0 z-10 -mx-8 mb-2 flex items-center justify-end gap-2 bg-[var(--paper)]/85 px-8 py-2 backdrop-blur">
        <button
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 text-[12.5px] text-[var(--ink)] hover:bg-[var(--paper)] disabled:cursor-default disabled:opacity-45"
          onClick={() => void copyWechat()}
          disabled={chars === 0 || copying}
        >
          {copying ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Copy size={13} />
          )}
          复制到公众号
        </button>
        <button
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 text-[12.5px] font-medium text-[var(--accent-fg)] shadow-[0_1px_4px_rgba(0,0,0,0.18)] hover:bg-[var(--accent-deep)]"
          onClick={() => router.push(`/edit/${doc.id}`)}
        >
          <PenLine size={13} />
          编辑此文
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
                <button
                  className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
                  onClick={() => {
                    setMenuOpen(false);
                    exportMarkdown(doc.title || "未命名文章", doc.content);
                  }}
                >
                  <Download size={13} className="text-[var(--ink-faint)]" />
                  导出 Markdown
                </button>
                {onDelete ? (
                  <>
                    <div className="my-1 border-t border-[var(--hairline)]" />
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
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* 标题 + 元信息：px-4 与正文 #nice 的 16px 内边距共线 */}
      <div className="rise mx-auto max-w-[720px] px-4 pt-4">
        <h1 className="text-[32px] font-bold leading-[1.25] tracking-tight text-[var(--ink)] [font-family:var(--serif)]">
          {doc.title || "未命名文章"}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--ink-faint)]">
          <button
            className="flex cursor-pointer items-center gap-1 rounded-md bg-[var(--accent-wash)] px-2 py-0.5 text-[var(--ink-soft)] hover:text-[var(--ink)]"
            onClick={() => onOpenCategory(doc.category || "未分类")}
          >
            <Folder size={12} />
            {doc.category || "未分类"}
          </button>
          <span>·</span>
          <span>
            {new Date(doc.updatedAt).toLocaleString("zh-CN", {
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span>·</span>
          <span>{chars} 字</span>
          {chars > 0 ? (
            <>
              <span>·</span>
              <span>约 {Math.max(1, Math.ceil(chars / 400))} 分钟读完</span>
            </>
          ) : null}
        </div>
        <div className="mb-4 mt-8 h-px w-10 bg-[var(--hairline-strong)]" />
      </div>

      {/* 空文章：不渲染空白稿纸，给一个引导写作的空状态 */}
      {chars === 0 ? (
        <div className="rise mx-auto flex max-w-[720px] flex-col items-center gap-4 rounded-xl border border-dashed border-[var(--hairline-strong)] bg-[var(--panel)]/50 py-20">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--ink-soft)]">
            <PenLine size={20} />
          </span>
          <div className="text-center">
            <p className="text-[14px] font-medium text-[var(--ink)]">这篇文章还没有内容</p>
            <p className="mt-1 text-[12.5px] text-[var(--ink-faint)]">从一个想法、一句话开始</p>
          </div>
          <button
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 text-[12.5px] font-medium text-[var(--accent-fg)] shadow-[0_1px_4px_rgba(0,0,0,0.18)] hover:bg-[var(--accent-deep)]"
            onClick={() => router.push(`/edit/${doc.id}`)}
          >
            <PenLine size={13} />
            开始写作
          </button>
        </div>
      ) : (
      /* 渲染内容（已消毒）：日间与页面同底无缝，夜间成一张白纸卡片 */
      <div
        className="rise light-lock mx-auto max-w-[720px] dark:overflow-hidden dark:rounded-2xl dark:bg-white"
        style={{ animationDelay: "90ms" }}
      >
        <style>{BASE_CSS}</style>
        {/* 阅读态与页面同底：打透 BASE_CSS 的白底；主题自带的底色在后面仍可覆盖 */}
        <style>{"#nice{background-color:transparent}"}</style>
        <style>{codeCss}</style>
        <style>{theme.css}</style>
        <style>{buildTuneCss({ tuneFontSize, tuneLineHeight, tuneParaSpacing })}</style>
        {customCss ? <style>{customCss}</style> : null}
        <section id="nice" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      )}
    </div>
  );
}
