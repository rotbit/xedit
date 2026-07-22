"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  ArrowLeft,
  Palette,
  Settings2,
  Download,
  History,
  LogOut,
  LogIn,
  ChevronDown,
  Loader2,
  Copy,
  Sparkles,
  Languages,
  Wand2,
  ImagePlus,
  ShieldCheck,
  Folder,
  FolderPlus,
  Check,
  FileText,
  ChevronsUpDown,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { clearMirror } from "@/lib/docStore";
import { getTheme, getCodeThemeCss, buildTuneCss } from "@/lib/themes";
import { buildWechatHtml } from "@/lib/copy/wechat";
import { buildZhihuHtml } from "@/lib/copy/zhihu";
import { copyRichHtml } from "@/lib/copy/clipboard";
import { exportMarkdown, exportHtml, exportPdf, exportImage } from "@/lib/export";
import { toast } from "./Toast";
import { askInput } from "./PromptDialog";
import { openAuth } from "./AuthDialog";
import { DarkToggle } from "./DarkToggle";
import { ThemePickerPanel } from "./ThemePicker";
import { AiSettingsDialog, AiImageDialog } from "./AiDialogs";
import { ReviewDialog } from "./ReviewDialog";
import { AiDiffDialog, AiTitlesDialog, AiSummaryDialog } from "./AiWriteDialogs";
import type { EditorHandle } from "./MarkdownEditor";

const AI_PROMPTS = {
  en: "你是专业译者。把用户提供的内容翻译成地道的英文。保留 Markdown 语法结构，代码块内容不翻译。只输出译文，不要任何解释。",
  zh: "你是专业译者。把用户提供的内容翻译成流畅的简体中文。保留 Markdown 语法结构，代码块内容不翻译。只输出译文，不要任何解释。",
  polish:
    "你是资深中文编辑。润色用户提供的文字，使表达更流畅、精炼、有条理。保留 Markdown 语法结构与原文含义。只输出润色后的文本，不要任何解释。",
  expand:
    "你是资深中文编辑。在保留原意、语气与 Markdown 结构的前提下扩写内容（约为原文 1.5~2 倍），补充细节、例证与衔接。只输出扩写后的文本。",
  condense:
    "你是资深中文编辑。把内容压缩到约一半篇幅，保留关键信息、结论与 Markdown 结构。只输出压缩后的文本。",
  format:
    "你是资深微信公众号编辑。重新组织这篇 Markdown 文章的结构：合理分段、拟定或优化小标题（##/###）、为关键句加粗、把并列内容整理为列表、适当用引用块突出金句。不得改变事实内容与作者语气，不删除信息。只输出整理后的完整 Markdown，不要任何解释。",
} as const;

const AI_TITLES: Record<keyof typeof AI_PROMPTS, string> = {
  en: "翻译为英文",
  zh: "翻译为中文",
  polish: "润色",
  expand: "扩写",
  condense: "缩写",
  format: "智能排版",
};


function Dropdown({
  trigger,
  children,
  width = 220,
  align = "right",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  /** 菜单与触发器的对齐边：靠视口左缘的触发器用 left，避免菜单伸出屏幕 */
  align?: "left" | "right";
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
    <div className="relative shrink-0" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open ? (
        <div
          className={`absolute ${align === "left" ? "left-0" : "right-0"} top-[calc(100%+6px)] z-50 overflow-y-auto rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] max-md:fixed max-md:inset-x-2 max-md:top-[52px] max-md:w-auto!`}
          style={{
            width,
            maxWidth: "calc(100vw - 16px)",
            maxHeight: "calc(100vh - 64px)",
          }}
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
  editorRef,
  onOpenVersions,
}: {
  editorRef: RefObject<EditorHandle | null>;
  onOpenVersions: () => void;
}) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const docId = useStore((s) => s.docId);
  const category = useStore((s) => s.category);
  const setCategory = useStore((s) => s.setCategory);
  const themeId = useStore((s) => s.themeId);
  const linkFootnote = useStore((s) => s.linkFootnote);
  const setLinkFootnote = useStore((s) => s.setLinkFootnote);
  const syncScroll = useStore((s) => s.syncScroll);
  const setSyncScroll = useStore((s) => s.setSyncScroll);
  const tuneFontSize = useStore((s) => s.tuneFontSize);
  const tuneLineHeight = useStore((s) => s.tuneLineHeight);
  const tuneParaSpacing = useStore((s) => s.tuneParaSpacing);
  const setTune = useStore((s) => s.setTune);

  const [copying, setCopying] = useState<"wechat" | "zhihu" | null>(null);
  const [catList, setCatList] = useState<string[]>([]);
  const [docList, setDocList] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    if (status !== "authenticated" || !docId) return;
    let cancelled = false;
    void (async () => {
      const [docsRes, settingsRes] = await Promise.all([
        fetch("/api/documents"),
        fetch("/api/settings"),
      ]);
      if (cancelled) return;
      const set = new Set<string>(["未分类"]);
      if (docsRes.ok) {
        const list = await docsRes.json();
        for (const d of list) if (d.category) set.add(d.category);
        if (!cancelled)
          setDocList(list.map((d: { id: string; title: string }) => ({ id: d.id, title: d.title })));
      }
      if (settingsRes.ok) {
        const st = await settingsRes.json();
        try {
          const extra = JSON.parse(st?.categories ?? "[]");
          if (Array.isArray(extra)) for (const c of extra) if (typeof c === "string") set.add(c);
        } catch {
          // 忽略脏数据
        }
      }
      if (!cancelled) setCatList(Array.from(set));
    })();
    return () => {
      cancelled = true;
    };
  }, [status, docId]);

  // ⌘E / Ctrl+E 返回阅读态（与阅读态的 ⌘E 互为往返；capture 抢在 CodeMirror 之前）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        router.push(docId && status === "authenticated" ? `/?doc=${docId}` : "/");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [status, docId, router]);

  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiImageOpen, setAiImageOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [titlesOpen, setTitlesOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [diffTask, setDiffTask] = useState<{
    kind: keyof typeof AI_PROMPTS;
    original: string;
    from: number;
    to: number;
    wholeDoc: boolean;
  } | null>(null);

  const aiConfigured = () => {
    const s = useStore.getState();
    if (s.aiApiKey || s.aiBaseUrl.includes("localhost")) return true;
    toast("请先在「AI 设置」中配置接口和 Key", "error");
    setAiSettingsOpen(true);
    return false;
  };

  /** 选中文本类 AI：打开 diff 对照弹窗 */
  const startSelectionAi = (kind: keyof typeof AI_PROMPTS) => {
    const view = editorRef.current?.view();
    if (!view) return;
    const sel = view.state.selection.main;
    if (sel.from === sel.to) {
      toast("请先在编辑器中选中要处理的文字", "error");
      return;
    }
    if (!aiConfigured()) return;
    setDiffTask({
      kind,
      original: view.state.sliceDoc(sel.from, sel.to),
      from: sel.from,
      to: sel.to,
      wholeDoc: false,
    });
  };

  /** 全文类 AI（智能排版） */
  const startDocAi = (kind: keyof typeof AI_PROMPTS) => {
    const content = useStore.getState().content;
    if (!content.trim()) {
      toast("文章还是空的", "error");
      return;
    }
    if (!aiConfigured()) return;
    setDiffTask({ kind, original: content, from: 0, to: 0, wholeDoc: true });
  };

  const applyDiff = (result: string) => {
    const view = editorRef.current?.view();
    if (!view || !diffTask) return;
    if (diffTask.wholeDoc) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: result } });
    } else {
      view.dispatch({ changes: { from: diffTask.from, to: diffTask.to, insert: result } });
    }
    toast("已替换", "success");
  };

  const requireAiThen = (fn: () => void) => {
    if (!aiConfigured()) return;
    if (!useStore.getState().content.trim()) {
      toast("文章还是空的", "error");
      return;
    }
    fn();
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
    const tuneCss = buildTuneCss(s);
    return {
      themeCss: getTheme(s.themeId).css,
      codeCss,
      customCss: `${tuneCss}\n${s.customCss}`.trim(),
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

  const doExport = async (kind: "md" | "html" | "pdf" | "image") => {
    const s = useStore.getState();
    if (kind === "md") {
      exportMarkdown(s.title, s.content);
      return;
    }
    const opts = await buildOptions();
    if (kind === "html") await exportHtml(s.title, s.content, opts);
    else if (kind === "pdf") await exportPdf(s.title, s.content, opts);
    else {
      toast("正在生成长图…");
      await exportImage(s.title, s.content, opts);
    }
  };

  const handleLogin = () => openAuth("login");

  return (
    <>
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--hairline-soft)] bg-[var(--panel)] px-3">
      {/* 返回首页 */}
      <button
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
        onClick={() =>
          router.push(
            docId && status === "authenticated" ? `/?doc=${docId}` : "/"
          )
        }
        title={docId ? "返回文章阅读（⌘E）" : "返回文章列表（⌘E）"}
      >
        <ArrowLeft size={16} />
      </button>
      {/* 面包屑：分类 / 标题 */}
      {docId && status === "authenticated" ? (
        <Dropdown
          width={200}
          align="left"
          trigger={
            <button
              className="flex h-8 max-w-40 cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-2 text-[12.5px] text-[var(--ink-faint)] hover:border-[var(--hairline)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
              title="文章分类"
            >
              <Folder size={13} />
              <span className="truncate">{category}</span>
              <ChevronDown size={12} className="shrink-0 opacity-60" />
            </button>
          }
        >
          <p className="px-3.5 pb-1 pt-0.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
            移动到分类
          </p>
          {catList.map((c) => (
            <button key={c} className={itemCls} onClick={() => setCategory(c)}>
              <Folder size={13} className="shrink-0 text-[var(--ink-faint)]" />
              <span className="min-w-0 flex-1 truncate text-left">{c}</span>
              {c === category ? <Check size={13} className="shrink-0 text-[var(--accent)]" /> : null}
            </button>
          ))}
          <div className="my-1 border-t border-[var(--hairline)]" />
          <button
            className={itemCls}
            onClick={() => {
              void (async () => {
                const name = (await askInput({ title: "新建分类", placeholder: "分类名称" }))
                  ?.trim()
                  .slice(0, 50);
                if (!name) return;
                setCategory(name);
                setCatList((prev) => (prev.includes(name) ? prev : [...prev, name]));
              })();
            }}
          >
            <FolderPlus size={13} className="text-[var(--ink-faint)]" />
            新建分类…
          </button>
        </Dropdown>
      ) : null}
      {docId && status === "authenticated" ? (
        <span className="select-none text-[12px] text-[var(--ink-faint)]">/</span>
      ) : null}

      {/* 文档标题 */}
      <input
        className="h-8 w-24 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-[13px] font-medium text-[var(--ink)] outline-none transition-colors hover:border-[var(--hairline)] focus:border-[var(--hairline-strong)] focus:bg-[var(--panel)] sm:w-52"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="文章标题"
      />

      {/* 切换文章：最近列表，小改多篇时免回工作台 */}
      {docId && status === "authenticated" && docList.length > 1 ? (
        <Dropdown
          width={260}
          align="left"
          trigger={
            <button
              className="flex h-8 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
              title="切换文章"
            >
              <ChevronsUpDown size={13} />
            </button>
          }
        >
          <p className="px-3.5 pb-1 pt-0.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
            最近文章
          </p>
          {docList.slice(0, 10).map((d) => (
            <button
              key={d.id}
              className={itemCls}
              onClick={() => {
                if (d.id !== docId) router.push(`/edit/${d.id}`);
              }}
            >
              <FileText size={13} className="shrink-0 text-[var(--ink-faint)]" />
              <span className="min-w-0 flex-1 truncate text-left">
                {d.title || "未命名文章"}
              </span>
              {d.id === docId ? (
                <Check size={13} className="shrink-0 text-[var(--accent)]" />
              ) : null}
            </button>
          ))}
        </Dropdown>
      ) : null}

      <div className="flex-1" />

      {/* 排版主题 */}
      <Dropdown
        width={430}
        trigger={
          <button className={ghostBtn}>
            <Palette size={15} />
            <span className="hidden sm:inline">{getTheme(themeId).name}</span>
            <ChevronDown size={13} className="text-[var(--ink-faint)]" />
          </button>
        }
      >
        <ThemePickerPanel />
      </Dropdown>

      {/* 设置 */}
      <Dropdown
        width={264}
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
        <p className="px-3.5 pb-0.5 pt-0.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
          排版微调
        </p>
        {(
          [
            ["字号", tuneFontSize, 14, 18, 0.5, "px", (v: number) => setTune({ tuneFontSize: v })],
            ["行高", tuneLineHeight, 1.5, 2.2, 0.05, "", (v: number) => setTune({ tuneLineHeight: v })],
            ["段距", tuneParaSpacing, 8, 28, 2, "px", (v: number) => setTune({ tuneParaSpacing: v })],
          ] as const
        ).map(([label, value, min, max, step, unit, apply]) => (
          <div
            key={label}
            className="flex items-center gap-2.5 px-3.5 py-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="w-7 shrink-0 text-[12px] text-[var(--ink-soft)]">{label}</span>
            <input
              type="range"
              className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) => apply(Number(e.target.value))}
            />
            <span className="w-11 shrink-0 text-right text-[11.5px] text-[var(--ink-faint)] [font-family:var(--mono)]">
              {value}
              {unit}
            </span>
          </div>
        ))}
        <button
          className="mx-3.5 my-1 cursor-pointer rounded px-1.5 py-0.5 text-[11.5px] text-[var(--ink-faint)] hover:text-[var(--accent)]"
          onClick={(e) => {
            e.stopPropagation();
            setTune({ tuneFontSize: 16, tuneLineHeight: 1.75, tuneParaSpacing: 16 });
          }}
        >
          重置排版微调
        </button>
      </Dropdown>

      {/* AI 助手 */}
      <Dropdown
        width={200}
        trigger={
          <button className={ghostBtn} title="AI 助手">
            <Sparkles size={15} />
          </button>
        }
      >
        <p className="px-3.5 pb-0.5 pt-1 text-[11px] tracking-widest text-[var(--ink-faint)]">
          选中文字
        </p>
        <button className={itemCls} onClick={() => startSelectionAi("en")}>
          <Languages size={14} />
          翻译为英文
        </button>
        <button className={itemCls} onClick={() => startSelectionAi("zh")}>
          <Languages size={14} />
          翻译为中文
        </button>
        <button className={itemCls} onClick={() => startSelectionAi("polish")}>
          <Wand2 size={14} />
          润色
        </button>
        <button className={itemCls} onClick={() => startSelectionAi("expand")}>
          <Wand2 size={14} />
          扩写
        </button>
        <button className={itemCls} onClick={() => startSelectionAi("condense")}>
          <Wand2 size={14} />
          缩写
        </button>
        <div className="my-1.5 border-t border-[var(--hairline)]" />
        <p className="px-3.5 pb-0.5 pt-0.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
          整篇文章
        </p>
        <button className={itemCls} onClick={() => startDocAi("format")}>
          <Sparkles size={14} />
          智能排版全文…
        </button>
        <button className={itemCls} onClick={() => requireAiThen(() => setTitlesOpen(true))}>
          <Sparkles size={14} />
          AI 起标题…
        </button>
        <button className={itemCls} onClick={() => requireAiThen(() => setSummaryOpen(true))}>
          <Sparkles size={14} />
          AI 摘要…
        </button>
        <button
          className={itemCls}
          onClick={() => {
            if (aiConfigured()) setReviewOpen(true);
          }}
        >
          <ShieldCheck size={14} />
          公众号内容审查…
        </button>
        <div className="my-1.5 border-t border-[var(--hairline)]" />
        <button
          className={itemCls}
          onClick={() => {
            if (aiConfigured()) setAiImageOpen(true);
          }}
        >
          <ImagePlus size={14} />
          AI 生成配图…
        </button>
        <button className={itemCls} onClick={() => setAiSettingsOpen(true)}>
          <Settings2 size={14} />
          AI 设置…
        </button>
      </Dropdown>

      {/* 版本历史（窄屏隐藏，保证顶栏不溢出） */}
      <button className={`${ghostBtn} hidden shrink-0 md:flex`} onClick={onOpenVersions} title="版本历史">
        <History size={15} />
      </button>

      {/* 导出 */}
      <Dropdown
        width={180}
        trigger={
          <button className={`${ghostBtn} hidden md:flex`} title="导出">
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
        <button className={itemCls} onClick={() => void doExport("image")}>
          导出长图（PNG）
        </button>
      </Dropdown>

      {/* 夜间模式（窄屏隐藏，腾出顶栏空间） */}
      <div className="hidden shrink-0 sm:block">
        <DarkToggle />
      </div>

      <div className="mx-1 hidden h-5 w-px bg-[var(--hairline)] sm:block" />

      {/* 一键复制（选择平台） */}
      <Dropdown
        width={172}
        trigger={
          <button
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 text-[13px] font-medium text-[var(--accent-fg)] shadow-[0_1px_4px_rgba(0,0,0,0.18)] hover:bg-[var(--accent-deep)]"
            disabled={copying !== null}
          >
            {copying !== null ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Copy size={14} />
            )}
            <span className="hidden min-[400px]:inline">一键复制</span>
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

      <div className="mx-1 hidden h-5 w-px bg-[var(--hairline)] sm:block" />

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
          <button
            className={itemCls}
            onClick={() => {
              // 登出即清空本地镜像，避免下一个账号看到上一个账号的文章
              clearMirror();
              void signOut();
            }}
          >
            <LogOut size={14} />
            退出登录
          </button>
        </Dropdown>
      ) : (
        <button
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--hairline-strong)] px-3 text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
          onClick={handleLogin}
          disabled={status === "loading"}
        >
          <LogIn size={14} />
          登录
        </button>
      )}
    </header>
    {aiSettingsOpen ? <AiSettingsDialog onClose={() => setAiSettingsOpen(false)} /> : null}
    {aiImageOpen ? (
      <AiImageDialog onClose={() => setAiImageOpen(false)} onInsert={insertAtCursor} />
    ) : null}
    {reviewOpen ? <ReviewDialog onClose={() => setReviewOpen(false)} /> : null}
    {diffTask ? (
      <AiDiffDialog
        title={`AI ${AI_TITLES[diffTask.kind]}`}
        system={AI_PROMPTS[diffTask.kind]}
        original={diffTask.original}
        onApply={applyDiff}
        onClose={() => setDiffTask(null)}
      />
    ) : null}
    {titlesOpen ? <AiTitlesDialog onClose={() => setTitlesOpen(false)} /> : null}
    {summaryOpen ? <AiSummaryDialog onClose={() => setSummaryOpen(false)} /> : null}
    </>
  );
}
