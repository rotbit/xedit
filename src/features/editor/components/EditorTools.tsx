"use client";

import { useMemo, useState } from "react";
import { Palette, Settings2, Download, History, Sparkles, ShieldCheck } from "lucide-react";
import { useStore } from "@/store/useStore";
import { resolveTheme } from "@/lib/themes";
import { Dropdown, menuItemCls } from "@/components/Dropdown";
import { toast } from "@/components/Toast";
import { ThemePickerPanel } from "@/components/ThemePicker";
import { AiSettingsDialog } from "@/components/AiDialogs";
import { ReviewDialog } from "@/components/ReviewDialog";
import { ToggleRow, TypographyTuner } from "./MenuControls";
import { runExport, type ExportKind } from "../lib/exportDoc";

const iconBtn =
  "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]";

const EXPORT_ITEMS: { kind: ExportKind; label: string }[] = [
  { kind: "md", label: "导出 Markdown" },
  { kind: "html", label: "导出 HTML" },
  { kind: "docx", label: "导出 Word（可导入飞书）" },
  { kind: "pdf", label: "导出 PDF（打印）" },
  { kind: "image", label: "导出长图（PNG）" },
];

/**
 * 首页阅读态编辑器的功能簇：排版主题 / 设置 / 内容审查 / 版本历史 / 导出。
 * 通过 ArticleReader 挂进面包屑顶栏（不再单开一条 Topbar）。
 * 返回一个 Fragment（触发按钮 + 各弹窗），便于被 ArticleReader 的 portal 直接包裹。
 */
export function EditorTools({ onOpenVersions }: { onOpenVersions: () => void }) {
  const themeId = useStore((s) => s.themeId);
  const customThemes = useStore((s) => s.customThemes);
  const linkFootnote = useStore((s) => s.linkFootnote);
  const setLinkFootnote = useStore((s) => s.setLinkFootnote);
  const syncScroll = useStore((s) => s.syncScroll);
  const setSyncScroll = useStore((s) => s.setSyncScroll);
  const sourceMode = useStore((s) => s.sourceMode);
  const setSourceMode = useStore((s) => s.setSourceMode);

  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  // 只为 title 文案取主题名：resolveTheme 遇到自定义主题会全量重建 CSS，别每次渲染都跑
  const themeName = useMemo(() => resolveTheme(themeId, customThemes).name, [themeId, customThemes]);

  /** 内容审查依赖文本平台密钥，未配置时直接引导到 AI 设置 */
  const startReview = () => {
    if (!useStore.getState().content.trim()) {
      toast("文章还是空的", "error");
      return;
    }
    if (!useStore.getState().aiChatReady) {
      toast("请先在「AI 设置」中填写文本平台密钥", "error");
      setAiSettingsOpen(true);
      return;
    }
    setReviewOpen(true);
  };

  return (
    <>
      {/* 排版主题 */}
      <Dropdown
        width={430}
        trigger={
          <button className={iconBtn} title={`排版主题：${themeName}`}>
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
        <ToggleRow label="外链转文末引用" value={linkFootnote} onChange={setLinkFootnote} />
        <ToggleRow label="同步滚动" value={syncScroll} onChange={setSyncScroll} />
        <ToggleRow label="源码模式（⌘/）" value={sourceMode} onChange={setSourceMode} />
        <div className="my-1.5 border-t border-[var(--hairline)]" />
        <TypographyTuner />
        <div className="my-1 border-t border-[var(--hairline)]" />
        <button className={menuItemCls} onClick={() => setAiSettingsOpen(true)}>
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
        {EXPORT_ITEMS.map(({ kind, label }) => (
          <button key={kind} className={menuItemCls} onClick={() => void runExport(kind)}>
            {label}
          </button>
        ))}
      </Dropdown>

      {/* 弹窗集合：均为 fixed 覆盖层，挂在 portal 内亦不受影响 */}
      {aiSettingsOpen ? <AiSettingsDialog onClose={() => setAiSettingsOpen(false)} /> : null}
      {reviewOpen ? <ReviewDialog onClose={() => setReviewOpen(false)} /> : null}
    </>
  );
}
