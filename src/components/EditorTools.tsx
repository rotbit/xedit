"use client";

import { useEffect, useRef, useState } from "react";
import {
  Palette,
  Settings2,
  Download,
  History,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { getTheme, getCodeThemeCss, buildTuneCss } from "@/lib/themes";
import { exportMarkdown, exportHtml, exportPdf, exportImage } from "@/lib/export";
import { toast } from "./Toast";
import { ThemePickerPanel } from "./ThemePicker";
import { AiSettingsDialog } from "./AiDialogs";
import { ReviewDialog } from "./ReviewDialog";

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
  "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]";

const itemCls =
  "flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]";

/**
 * 首页阅读态编辑器的功能簇：排版主题 / 设置 / 内容审查 / 版本历史 / 导出。
 * 从老编辑页 Topbar 抽出、自包含，通过 ArticleReader 挂进面包屑顶栏（不再单开一条 Topbar）。
 * 返回一个 Fragment（触发按钮 + 各弹窗），便于被 ArticleReader 的 portal 直接包裹。
 */
export function EditorTools({ onOpenVersions }: { onOpenVersions: () => void }) {
  const themeId = useStore((s) => s.themeId);
  const linkFootnote = useStore((s) => s.linkFootnote);
  const setLinkFootnote = useStore((s) => s.setLinkFootnote);
  const syncScroll = useStore((s) => s.syncScroll);
  const setSyncScroll = useStore((s) => s.setSyncScroll);
  const sourceMode = useStore((s) => s.sourceMode);
  const setSourceMode = useStore((s) => s.setSourceMode);
  const tuneFontSize = useStore((s) => s.tuneFontSize);
  const tuneLineHeight = useStore((s) => s.tuneLineHeight);
  const tuneParaSpacing = useStore((s) => s.tuneParaSpacing);
  const setTune = useStore((s) => s.setTune);

  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const aiConfigured = () => {
    if (useStore.getState().aiChatReady) return true;
    toast("请先在「AI 设置」中填写文本平台密钥", "error");
    setAiSettingsOpen(true);
    return false;
  };

  const startReview = () => {
    if (!useStore.getState().content.trim()) {
      toast("文章还是空的", "error");
      return;
    }
    if (!aiConfigured()) return;
    setReviewOpen(true);
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
            <Palette size={16} strokeWidth={1.75} />
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
            <Settings2 size={16} strokeWidth={1.75} />
          </button>
        }
      >
        {(
          [
            ["外链转文末引用", linkFootnote, setLinkFootnote],
            ["同步滚动", syncScroll, setSyncScroll],
            ["源码模式（⌘/）", sourceMode, setSourceMode],
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
        <div className="my-1 border-t border-[var(--hairline)]" />
        <button className={itemCls} onClick={() => setAiSettingsOpen(true)}>
          <Sparkles size={14} />
          AI 设置…
        </button>
      </Dropdown>

      {/* 公众号内容审查 */}
      <button className={iconBtn} onClick={startReview} title="公众号内容审查">
        <ShieldCheck size={16} strokeWidth={1.75} />
      </button>

      {/* 版本历史 */}
      <button className={iconBtn} onClick={onOpenVersions} title="版本历史">
        <History size={16} strokeWidth={1.75} />
      </button>

      {/* 导出 */}
      <Dropdown
        width={180}
        trigger={
          <button className={iconBtn} title="导出">
            <Download size={16} strokeWidth={1.75} />
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
      {reviewOpen ? <ReviewDialog onClose={() => setReviewOpen(false)} /> : null}
    </>
  );
}
