"use client";

// Commands available while an article is open: format / view / article / copy & export.
// The command table lives here rather than in ArticleReader to avoid bloating that already tight component further.

import { useRegisterCommands } from "@/hooks/useRegisterCommands";
import type { Command } from "@/lib/commandRegistry";
import type { FormatCommand } from "@/lib/editor/commands";
import { tk } from "@/i18n/t";
import { useT } from "@/i18n/useT";
import { useStore } from "@/store/useStore";
import { copyDoc } from "../lib/copyDoc";
import { EXPORT_ITEMS, runExport } from "../lib/exportDoc";

/** Format commands that go through applyFormat; keys are hints only, the real bindings are in the editorExtensions keymap */
const FORMAT_ITEMS: { cmd: FormatCommand; label: string; keys?: string }[] = [
  { cmd: "bold", label: tk("加粗"), keys: "⌘B" },
  { cmd: "italic", label: tk("斜体"), keys: "⌘I" },
  { cmd: "strike", label: tk("删除线"), keys: "⌘⇧X" },
  // Inline code doesn't use ⌘⇧C: that's Chrome's "Inspect element", which a web page can't intercept
  { cmd: "code", label: tk("行内代码"), keys: "⌘⇧K" },
  { cmd: "h1", label: tk("一级标题"), keys: "⌘⌥1" },
  { cmd: "h2", label: tk("二级标题"), keys: "⌘⌥2" },
  { cmd: "h3", label: tk("三级标题"), keys: "⌘⌥3" },
  { cmd: "quote", label: tk("引用"), keys: "⌘⇧." },
  { cmd: "tasklist", label: tk("任务列表"), keys: "⌘⇧9" },
  { cmd: "codeblock", label: tk("代码块") },
  { cmd: "link", label: tk("链接"), keys: "⌘K" },
  { cmd: "table", label: tk("表格") },
  { cmd: "hr", label: tk("分割线") },
];

interface Params {
  applyFormat: (cmd: FormatCommand) => void;
  toggleSplit: () => void;
  toggleReading: () => void;
  openVersions: () => void;
  /** Opens the searchable category picker */
  pickCategory: () => void;
  openShare: () => void;
  /** If the list view doesn't pass it, there's no delete entry (trash/read-only contexts) */
  onDelete?: () => void;
}

export function useReaderCommands({
  applyFormat,
  toggleSplit,
  toggleReading,
  openVersions,
  pickCategory,
  openShare,
  onDelete,
}: Params) {
  const t = useT();
  const cmds: Command[] = [
    ...FORMAT_ITEMS.map(({ cmd, label, keys }) => ({
      id: `format.${cmd}`,
      group: t("格式"),
      label: t(label),
      keys,
      run: () => applyFormat(cmd),
    })),
    {
      id: "view.source",
      group: t("视图"),
      label: t("切换源码模式"),
      keys: "⌘/",
      // Same path as ⌘/ in useEditorViewMode: flip the store directly, no need to go through the component
      run: () => {
        const s = useStore.getState();
        s.setSourceMode(!s.sourceMode);
      },
    },
    { id: "view.split", group: t("视图"), label: t("切换双屏预览"), keys: "⌘E", run: toggleSplit },
    { id: "view.reading", group: t("视图"), label: t("切换阅读模式"), keys: "⌘⇧E", run: toggleReading },
    { id: "doc.versions", group: t("文章"), label: t("版本历史"), run: openVersions },
    { id: "doc.move", group: t("文章"), label: t("移动到文件夹…"), run: pickCategory },
    { id: "doc.share", group: t("文章"), label: t("分享给他人查看与批注…"), run: openShare },
    {
      id: "doc.delete",
      group: t("文章"),
      label: t("删除文章"),
      // onDelete is provided by the parent per context; without it, it doesn't show in the palette (when is asked fresh each time, getting the latest)
      when: () => Boolean(onDelete),
      run: () => onDelete?.(),
    },
    {
      id: "copy.wechat",
      group: t("复制导出"),
      label: t("复制到公众号"),
      run: () => copyDoc("wechat"),
    },
    { id: "copy.zhihu", group: t("复制导出"), label: t("复制到知乎"), run: () => copyDoc("zhihu") },
    ...EXPORT_ITEMS.map(({ kind, label }) => ({
      id: `export.${kind}`,
      group: t("复制导出"),
      label: t(label),
      run: () => runExport(kind),
    })),
  ];

  // The command table is static (items and order don't change across renders); closure freshness is handled by useRegisterCommands' ref:
  // register once when the article view mounts and unregister on unmount, so command order in the palette stays stable.
  // The registration wrapper only reads label at registration time, so t is in the deps: switching language re-registers and the palette text follows
  useRegisterCommands(cmds, [t]);
}
