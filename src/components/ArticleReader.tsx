"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Columns2,
  Folder,
  Copy,
  ChevronDown,
  MoreHorizontal,
  Download,
  Trash2,
} from "lucide-react";
import { buildWechatHtml } from "@/lib/copy/wechat";
import { buildZhihuHtml } from "@/lib/copy/zhihu";
import { copyRichHtml } from "@/lib/copy/clipboard";
import { exportMarkdown } from "@/lib/export";
import { toast } from "./Toast";
import { getTheme, getCodeThemeCss, buildTuneCss } from "@/lib/themes";
import { useStore } from "@/store/useStore";
import { useEditorDoc } from "@/hooks/useEditorDoc";
import { MarkdownEditor } from "./MarkdownEditor";

const SAVE_LABEL: Record<string, string> = {
  local: "已存本地",
  saving: "保存中…",
  saved: "已保存",
  pending: "已存本地，联网后同步",
  error: "保存失败",
};

/**
 * 首页右侧的文章视图：打开即是即时渲染编辑态（类 Obsidian Live Preview）——
 * 在页面内直接呈现排版并可编辑，光标所在行还原源码；
 * 公众号真实主题效果与左右分屏在编辑页（分屏编辑）查看。
 */
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
  // 装载 + 自动保存复用编辑页管线（本地/云端文档皆可）
  const { docVersion, loading } = useEditorDoc(docId);

  const title = useStore((s) => s.title);
  const content = useStore((s) => s.content);
  const category = useStore((s) => s.category);
  const saveState = useStore((s) => s.saveState);
  const setTitle = useStore((s) => s.setTitle);
  const setContent = useStore((s) => s.setContent);

  const [copying, setCopying] = useState<"wechat" | "zhihu" | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  /** 进入分屏编辑；离线时编辑页可能未缓存，留在本页即时渲染编辑 */
  const goSplitEdit = useCallback(() => {
    if (!navigator.onLine) {
      toast("离线时分屏编辑暂不可用，可在此页直接编辑", "error");
      return;
    }
    router.push(`/edit/${docId}`);
  }, [docId, router]);

  // ⌘E / Ctrl+E 进入分屏编辑（capture 阶段，优先于页面内其他监听）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        goSplitEdit();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [goSplitEdit]);

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
      <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-[var(--ink-faint)]">
        <Loader2 size={16} className="animate-spin" /> 加载中…
      </div>
    );
  }

  const chars = content.replace(/\s/g, "").length;
  const docKey = `${docId}:${docVersion}`;

  return (
    <div>
      {/* 操作栏：sticky 顶置，滚动时保持可达；面包屑只保留内容区顶栏一处。
          不加入场动画：内部 ··· 菜单的 fixed 遮罩需以视口为参照 */}
      <div className="sticky top-0 z-10 -mx-4 mb-2 flex items-center justify-end gap-2 bg-[var(--paper)]/85 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8">
        {/* 一键复制：与编辑页同款，点开选择平台 */}
        <div className="relative">
          <button
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 text-[12.5px] text-[var(--ink)] hover:bg-[var(--paper)] disabled:cursor-default disabled:opacity-45"
            onClick={() => setCopyMenuOpen((v) => !v)}
            disabled={chars === 0 || copying !== null}
          >
            {copying !== null ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Copy size={13} />
            )}
            一键复制
            <ChevronDown size={12} className="opacity-70" />
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
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 text-[12.5px] font-medium text-[var(--accent-fg)] shadow-[0_1px_4px_rgba(0,0,0,0.18)] hover:bg-[var(--accent-deep)]"
          title="左侧源码、右侧公众号真实效果（⌘E）"
          onClick={goSplitEdit}
        >
          <Columns2 size={13} />
          分屏编辑
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
                    exportMarkdown(title || "未命名文章", useStore.getState().content);
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

      {/* 标题（可直接改）+ 元信息：px-4 与正文编辑区的行内边距共线 */}
      <div className="rise mx-auto max-w-[720px] px-4 pt-4">
        <input
          className="w-full bg-transparent text-2xl font-bold leading-[1.25] tracking-tight text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] [font-family:var(--serif)] sm:text-[32px]"
          value={title}
          placeholder="未命名文章"
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--ink-faint)]">
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
        <div className="mb-2 mt-8 h-px w-10 bg-[var(--hairline-strong)]" />
      </div>

      {/* 正文：即时渲染编辑器，随内容自然增高、跟随页面滚动 */}
      <div className="rise reader-live mx-auto max-w-[720px]" style={{ animationDelay: "90ms" }}>
        <MarkdownEditor
          key={docKey}
          docKey={docKey}
          initialContent={useStore.getState().content}
          live
          onChange={setContent}
        />
      </div>
    </div>
  );
}
