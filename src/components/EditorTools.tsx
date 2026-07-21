"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Palette,
  Settings2,
  Download,
  History,
  Sparkles,
  Languages,
  Wand2,
  ImagePlus,
  ShieldCheck,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { getTheme, getCodeThemeCss, buildTuneCss } from "@/lib/themes";
import { exportMarkdown, exportHtml, exportPdf, exportImage } from "@/lib/export";
import { toast } from "./Toast";
import { ThemePickerPanel } from "./ThemePicker";
import { AiSettingsDialog, AiImageDialog } from "./AiDialogs";
import { ReviewDialog } from "./ReviewDialog";
import { AiDiffDialog, AiTitlesDialog, AiSummaryDialog } from "./AiWriteDialogs";
import type { EditorHandle } from "./MarkdownEditor";

// 与老编辑页 Topbar 一致的一组 AI 提示词；此处独立一份，保证首页阅读态无需依赖 Topbar
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

/** 轻量下拉：点击外部关闭，菜单靠右对齐，窄屏铺满 */
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
    <div className="relative shrink-0" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-50 overflow-y-auto rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] max-md:fixed max-md:inset-x-2 max-md:top-[52px] max-md:w-auto!"
          style={{ width, maxWidth: "calc(100vw - 16px)", maxHeight: "calc(100vh - 64px)" }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

const iconBtn =
  "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]";

const itemCls =
  "flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]";

/**
 * 首页阅读态编辑器的功能簇：排版主题 / 设置 / AI 助手 / 版本历史 / 导出。
 * 从老编辑页 Topbar 抽出、自包含，通过 ArticleReader 挂进面包屑顶栏（不再单开一条 Topbar）。
 * 返回一个 Fragment（触发按钮 + 各弹窗），便于被 ArticleReader 的 portal 直接包裹。
 */
export function EditorTools({
  editorRef,
  onOpenVersions,
}: {
  editorRef: RefObject<EditorHandle | null>;
  onOpenVersions: () => void;
}) {
  const themeId = useStore((s) => s.themeId);
  const linkFootnote = useStore((s) => s.linkFootnote);
  const setLinkFootnote = useStore((s) => s.setLinkFootnote);
  const syncScroll = useStore((s) => s.syncScroll);
  const setSyncScroll = useStore((s) => s.setSyncScroll);
  const tuneFontSize = useStore((s) => s.tuneFontSize);
  const tuneLineHeight = useStore((s) => s.tuneLineHeight);
  const tuneParaSpacing = useStore((s) => s.tuneParaSpacing);
  const setTune = useStore((s) => s.setTune);

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

  const doExport = async (kind: "md" | "html" | "pdf" | "image") => {
    const s = useStore.getState();
    if (kind === "md") {
      exportMarkdown(s.title, s.content);
      return;
    }
    const opts = {
      themeCss: getTheme(s.themeId).css,
      codeCss: await getCodeThemeCss(s.codeThemeId),
      customCss: `${buildTuneCss(s)}\n${s.customCss}`.trim(),
      macCode: s.macCode,
      linkFootnote: s.linkFootnote,
    };
    if (kind === "html") await exportHtml(s.title, s.content, opts);
    else if (kind === "pdf") await exportPdf(s.title, s.content, opts);
    else {
      toast("正在生成长图…");
      await exportImage(s.title, s.content, opts);
    }
  };

  return (
    <>
      {/* 排版主题 */}
      <Dropdown
        width={430}
        trigger={
          <button className={iconBtn} title={`排版主题：${getTheme(themeId).name}`}>
            <Palette size={15} strokeWidth={1.75} />
          </button>
        }
      >
        <ThemePickerPanel />
      </Dropdown>

      {/* 设置 */}
      <Dropdown
        width={264}
        trigger={
          <button className={iconBtn} title="设置">
            <Settings2 size={15} strokeWidth={1.75} />
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
          <button className={iconBtn} title="AI 助手">
            <Sparkles size={15} strokeWidth={1.75} />
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

      {/* 版本历史 */}
      <button className={iconBtn} onClick={onOpenVersions} title="版本历史">
        <History size={15} strokeWidth={1.75} />
      </button>

      {/* 导出 */}
      <Dropdown
        width={180}
        trigger={
          <button className={iconBtn} title="导出">
            <Download size={15} strokeWidth={1.75} />
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

      {/* 弹窗集合：均为 fixed 覆盖层，挂在 portal 内亦不受影响 */}
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
