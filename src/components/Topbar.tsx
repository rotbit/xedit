"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  ArrowLeft,
  Palette,
  Settings2,
  Download,
  History,
  LogOut,
  ChevronDown,
  Loader2,
  Copy,
  Sparkles,
  Languages,
  Wand2,
  ImagePlus,
  ShieldCheck,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { getTheme, getCodeThemeCss } from "@/lib/themes";
import { buildWechatHtml } from "@/lib/copy/wechat";
import { buildZhihuHtml } from "@/lib/copy/zhihu";
import { copyRichHtml } from "@/lib/copy/clipboard";
import { exportMarkdown, exportHtml, exportPdf } from "@/lib/export";
import { toast } from "./Toast";
import { ThemePickerPanel } from "./ThemePicker";
import { AiSettingsDialog, AiImageDialog } from "./AiDialogs";
import { ReviewDialog } from "./ReviewDialog";
import type { EditorHandle } from "./MarkdownEditor";

const AI_PROMPTS = {
  en: "你是专业译者。把用户提供的内容翻译成地道的英文。保留 Markdown 语法结构，代码块内容不翻译。只输出译文，不要任何解释。",
  zh: "你是专业译者。把用户提供的内容翻译成流畅的简体中文。保留 Markdown 语法结构，代码块内容不翻译。只输出译文，不要任何解释。",
  polish:
    "你是资深中文编辑。润色用户提供的文字，使表达更流畅、精炼、有条理。保留 Markdown 语法结构与原文含义。只输出润色后的文本，不要任何解释。",
} as const;

interface AppConfig {
  github: boolean;
  oss: boolean;
}

export function GithubMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Dropdown({
  trigger,
  children,
  width = 220,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-50 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_8px_30px_rgba(40,30,10,0.12)]"
          style={{ width }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

const itemCls =
  "flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]";

const ghostBtn =
  "flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-2.5 text-[13px] text-[var(--ink-soft)] hover:border-[var(--hairline)] hover:bg-[var(--paper)] hover:text-[var(--ink)]";

export function Topbar({
  config,
  editorRef,
  onOpenVersions,
}: {
  config: AppConfig | null;
  editorRef: RefObject<EditorHandle | null>;
  onOpenVersions: () => void;
}) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const themeId = useStore((s) => s.themeId);
  const linkFootnote = useStore((s) => s.linkFootnote);
  const setLinkFootnote = useStore((s) => s.setLinkFootnote);
  const syncScroll = useStore((s) => s.syncScroll);
  const setSyncScroll = useStore((s) => s.setSyncScroll);
  const setCssDialogOpen = useStore((s) => s.setCssDialogOpen);

  const [copying, setCopying] = useState<"wechat" | "zhihu" | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiImageOpen, setAiImageOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const aiConfigured = () => {
    const s = useStore.getState();
    if (s.aiApiKey || s.aiBaseUrl.includes("localhost")) return true;
    toast("请先在「AI 设置」中配置接口和 Key", "error");
    setAiSettingsOpen(true);
    return false;
  };

  /** 对编辑器选中文本执行 AI 处理并原地替换 */
  const runAiText = async (kind: keyof typeof AI_PROMPTS) => {
    const view = editorRef.current?.view();
    if (!view || aiBusy) return;
    const sel = view.state.selection.main;
    if (sel.from === sel.to) {
      toast("请先在编辑器中选中要处理的文字", "error");
      return;
    }
    if (!aiConfigured()) return;
    const text = view.state.sliceDoc(sel.from, sel.to);
    const s = useStore.getState();
    setAiBusy(true);
    toast("AI 处理中，请稍候…");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: s.aiBaseUrl,
          apiKey: s.aiApiKey,
          model: s.aiModel,
          system: AI_PROMPTS[kind],
          prompt: text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      view.dispatch({ changes: { from: sel.from, to: sel.to, insert: data.text } });
      toast("已完成", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI 调用失败", "error");
    } finally {
      setAiBusy(false);
    }
  };

  const insertAtCursor = (md: string) => {
    const view = editorRef.current?.view();
    if (!view) return;
    const pos = view.state.selection.main.head;
    view.dispatch({ changes: { from: pos, insert: md } });
  };

  const buildOptions = async () => {
    const s = useStore.getState();
    const codeCss = await getCodeThemeCss(s.codeThemeId);
    return {
      themeCss: getTheme(s.themeId).css,
      codeCss,
      customCss: s.customCss,
      macCode: s.macCode,
      linkFootnote: s.linkFootnote,
    };
  };

  // 开发环境暴露构建函数，便于在控制台检查复制产物
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__xeditBuildWechat = async () =>
      buildWechatHtml(useStore.getState().content, await buildOptions());
    (window as unknown as Record<string, unknown>).__xeditBuildZhihu = () =>
      buildZhihuHtml(useStore.getState().content);
  }, []);

  const copyWechat = async () => {
    setCopying("wechat");
    try {
      const opts = await buildOptions();
      const content = useStore.getState().content;
      const html = await buildWechatHtml(content, opts);
      await copyRichHtml(html, content);
      toast("已复制！打开公众号后台编辑器直接粘贴", "success");
    } catch (e) {
      toast(`复制失败：${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setCopying(null);
    }
  };

  const copyZhihu = async () => {
    setCopying("zhihu");
    try {
      const content = useStore.getState().content;
      const html = await buildZhihuHtml(content);
      await copyRichHtml(html, content);
      toast("已复制！打开知乎编辑器直接粘贴", "success");
    } catch (e) {
      toast(`复制失败：${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setCopying(null);
    }
  };

  const doExport = async (kind: "md" | "html" | "pdf") => {
    const s = useStore.getState();
    if (kind === "md") {
      exportMarkdown(s.title, s.content);
      return;
    }
    const opts = await buildOptions();
    if (kind === "html") await exportHtml(s.title, s.content, opts);
    else await exportPdf(s.title, s.content, opts);
  };

  const handleLogin = () => {
    if (config && !config.github) {
      toast("尚未配置 GitHub OAuth，请在 .env 中填写 AUTH_GITHUB_ID/SECRET", "error");
      return;
    }
    void signIn("github");
  };

  return (
    <>
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--hairline)] bg-[var(--panel)] px-3">
      {/* 返回首页 */}
      <button
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
        onClick={() => router.push("/")}
        title="返回文章列表"
      >
        <ArrowLeft size={16} />
      </button>
      <div className="flex select-none items-center gap-2 pr-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--accent)] text-[13px] font-bold text-white [font-family:var(--serif)]">
          稿
        </span>
        <span className="text-[15px] font-semibold tracking-wide [font-family:var(--serif)]">
          xEdit
        </span>
      </div>

      {/* 文档标题 */}
      <input
        className="h-8 w-52 rounded-md border border-transparent bg-transparent px-2 text-[13px] text-[var(--ink)] outline-none transition-colors hover:border-[var(--hairline)] focus:border-[var(--hairline-strong)] focus:bg-white"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="文章标题"
      />

      <div className="flex-1" />

      {/* 排版主题 */}
      <Dropdown
        width={430}
        trigger={
          <button className={ghostBtn}>
            <Palette size={15} />
            <span>{getTheme(themeId).name}</span>
            <ChevronDown size={13} className="text-[var(--ink-faint)]" />
          </button>
        }
      >
        <ThemePickerPanel />
      </Dropdown>

      {/* 设置 */}
      <Dropdown
        width={230}
        trigger={
          <button className={ghostBtn} title="设置">
            <Settings2 size={15} />
          </button>
        }
      >
        {(
          [
            ["外链转文末引用", linkFootnote, setLinkFootnote],
            ["同步滚动", syncScroll, setSyncScroll],
          ] as const
        ).map(([label, value, setter]) => (
          <button
            key={label}
            className={itemCls}
            onClick={(e) => {
              e.stopPropagation();
              setter(!value);
            }}
          >
            <span className="flex-1 text-left">{label}</span>
            <span
              className={`relative h-4 w-7 rounded-full transition-colors ${value ? "bg-[var(--accent)]" : "bg-[var(--hairline-strong)]"}`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${value ? "left-3.5" : "left-0.5"}`}
              />
            </span>
          </button>
        ))}
        <div className="my-1.5 border-t border-[var(--hairline)]" />
        <button className={itemCls} onClick={() => setCssDialogOpen(true)}>
          自定义 CSS…
        </button>
      </Dropdown>

      {/* AI 助手 */}
      <Dropdown
        width={200}
        trigger={
          <button className={ghostBtn} title="AI 助手">
            {aiBusy ? (
              <Loader2 size={15} className="animate-spin text-[var(--accent)]" />
            ) : (
              <Sparkles size={15} />
            )}
          </button>
        }
      >
        <button className={itemCls} onClick={() => void runAiText("en")} disabled={aiBusy}>
          <Languages size={14} />
          选中翻译为英文
        </button>
        <button className={itemCls} onClick={() => void runAiText("zh")} disabled={aiBusy}>
          <Languages size={14} />
          选中翻译为中文
        </button>
        <button className={itemCls} onClick={() => void runAiText("polish")} disabled={aiBusy}>
          <Wand2 size={14} />
          润色选中文字
        </button>
        <button
          className={itemCls}
          onClick={() => {
            if (aiConfigured()) setAiImageOpen(true);
          }}
          disabled={aiBusy}
        >
          <ImagePlus size={14} />
          AI 生成配图…
        </button>
        <button
          className={itemCls}
          onClick={() => {
            if (aiConfigured()) setReviewOpen(true);
          }}
          disabled={aiBusy}
        >
          <ShieldCheck size={14} />
          公众号内容审查…
        </button>
        <div className="my-1.5 border-t border-[var(--hairline)]" />
        <button className={itemCls} onClick={() => setAiSettingsOpen(true)}>
          <Settings2 size={14} />
          AI 设置…
        </button>
      </Dropdown>

      {/* 版本历史 */}
      <button className={ghostBtn} onClick={onOpenVersions} title="版本历史">
        <History size={15} />
      </button>

      {/* 导出 */}
      <Dropdown
        width={180}
        trigger={
          <button className={ghostBtn} title="导出">
            <Download size={15} />
          </button>
        }
      >
        <button className={itemCls} onClick={() => void doExport("md")}>
          导出 Markdown
        </button>
        <button className={itemCls} onClick={() => void doExport("html")}>
          导出 HTML
        </button>
        <button className={itemCls} onClick={() => void doExport("pdf")}>
          导出 PDF（打印）
        </button>
      </Dropdown>

      <div className="mx-1 h-5 w-px bg-[var(--hairline)]" />

      {/* 一键复制（选择平台） */}
      <Dropdown
        width={172}
        trigger={
          <button
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(192,57,43,0.35)] hover:bg-[var(--accent-deep)]"
            disabled={copying !== null}
          >
            {copying !== null ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Copy size={14} />
            )}
            一键复制
            <ChevronDown size={13} className="opacity-80" />
          </button>
        }
      >
        <button className={itemCls} onClick={() => void copyWechat()} disabled={copying !== null}>
          复制到公众号
        </button>
        <button className={itemCls} onClick={() => void copyZhihu()} disabled={copying !== null}>
          复制到知乎
        </button>
      </Dropdown>

      <div className="mx-1 h-5 w-px bg-[var(--hairline)]" />

      {/* 登录态 */}
      {status === "authenticated" && session?.user ? (
        <Dropdown
          width={180}
          trigger={
            <button className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 hover:bg-[var(--paper)]">
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name ?? "avatar"}
                  className="h-6 w-6 rounded-full ring-1 ring-[var(--hairline-strong)]"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[11px] text-[var(--accent)]">
                  {(session.user.name ?? "U").slice(0, 1)}
                </span>
              )}
            </button>
          }
        >
          <p className="truncate px-3.5 py-1.5 text-[12px] text-[var(--ink-faint)]">
            {session.user.name ?? session.user.email}
          </p>
          <button className={itemCls} onClick={() => setAiSettingsOpen(true)}>
            <Sparkles size={14} />
            AI 设置…
          </button>
          <div className="my-1 border-t border-[var(--hairline)]" />
          <button className={itemCls} onClick={() => void signOut()}>
            <LogOut size={14} />
            退出登录
          </button>
        </Dropdown>
      ) : (
        <button
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--hairline-strong)] px-3 text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
          onClick={handleLogin}
          disabled={status === "loading"}
        >
          <GithubMark size={14} />
          登录
        </button>
      )}
    </header>
    {aiSettingsOpen ? <AiSettingsDialog onClose={() => setAiSettingsOpen(false)} /> : null}
    {aiImageOpen ? (
      <AiImageDialog onClose={() => setAiImageOpen(false)} onInsert={insertAtCursor} />
    ) : null}
    {reviewOpen ? <ReviewDialog onClose={() => setReviewOpen(false)} /> : null}
    </>
  );
}
