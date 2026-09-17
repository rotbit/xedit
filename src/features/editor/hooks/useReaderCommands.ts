"use client";

// 文章打开时可用的命令：格式 / 视图 / 文章 / 复制导出。
// 命令表放在这里而不是 ArticleReader 里，是为了不把那个本就吃紧的组件再撑大一截。

import { useRegisterCommands } from "@/hooks/useRegisterCommands";
import type { Command } from "@/lib/commandRegistry";
import type { FormatCommand } from "@/lib/editor/commands";
import { useStore } from "@/store/useStore";
import { copyDoc } from "../lib/copyDoc";
import { EXPORT_ITEMS, runExport } from "../lib/exportDoc";

/** 走 applyFormat 的格式命令；keys 只作提示，真正的绑定在 editorExtensions 的 keymap 里 */
const FORMAT_ITEMS: { cmd: FormatCommand; label: string; keys?: string }[] = [
  { cmd: "bold", label: "加粗", keys: "⌘B" },
  { cmd: "italic", label: "斜体", keys: "⌘I" },
  { cmd: "strike", label: "删除线", keys: "⌘⇧X" },
  // 行内代码不用 ⌘⇧C：那是 Chrome 的"检查元素"，网页拦不下来
  { cmd: "code", label: "行内代码", keys: "⌘⇧K" },
  { cmd: "h1", label: "一级标题", keys: "⌘⌥1" },
  { cmd: "h2", label: "二级标题", keys: "⌘⌥2" },
  { cmd: "h3", label: "三级标题", keys: "⌘⌥3" },
  { cmd: "quote", label: "引用", keys: "⌘⇧." },
  { cmd: "tasklist", label: "任务列表", keys: "⌘⇧9" },
  { cmd: "codeblock", label: "代码块" },
  { cmd: "link", label: "链接", keys: "⌘K" },
  { cmd: "table", label: "表格" },
  { cmd: "hr", label: "分割线" },
];

interface Params {
  applyFormat: (cmd: FormatCommand) => void;
  toggleSplit: () => void;
  toggleReading: () => void;
  openVersions: () => void;
  /** 弹带搜索的分类选择器 */
  pickCategory: () => void;
  openShare: () => void;
  /** 列表视图没传就没有删除入口（回收站/只读场景） */
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
  const cmds: Command[] = [
    ...FORMAT_ITEMS.map(({ cmd, label, keys }) => ({
      id: `format.${cmd}`,
      group: "格式",
      label,
      keys,
      run: () => applyFormat(cmd),
    })),
    {
      id: "view.source",
      group: "视图",
      label: "切换源码模式",
      keys: "⌘/",
      // 与 useEditorViewMode 里的 ⌘/ 同一条路径：直接翻 store，不必经过组件
      run: () => {
        const s = useStore.getState();
        s.setSourceMode(!s.sourceMode);
      },
    },
    { id: "view.split", group: "视图", label: "切换双屏预览", keys: "⌘E", run: toggleSplit },
    { id: "view.reading", group: "视图", label: "切换阅读模式", keys: "⌘⇧E", run: toggleReading },
    { id: "doc.versions", group: "文章", label: "版本历史", run: openVersions },
    { id: "doc.move", group: "文章", label: "移动到分类…", run: pickCategory },
    { id: "doc.share", group: "文章", label: "分享给他人查看与批注…", run: openShare },
    {
      id: "doc.delete",
      group: "文章",
      label: "删除文章",
      // onDelete 由上层按场景给，没有就不在面板里露出（when 每次现问，拿到的是最新那份）
      when: () => Boolean(onDelete),
      run: () => onDelete?.(),
    },
    {
      id: "copy.wechat",
      group: "复制导出",
      label: "复制到公众号",
      run: () => copyDoc("wechat"),
    },
    { id: "copy.zhihu", group: "复制导出", label: "复制到知乎", run: () => copyDoc("zhihu") },
    ...EXPORT_ITEMS.map(({ kind, label }) => ({
      id: `export.${kind}`,
      group: "复制导出",
      label,
      run: () => runExport(kind),
    })),
  ];

  // 命令表是静态的（条目与顺序不随渲染变），闭包新鲜度由 useRegisterCommands 的 ref 兜住：
  // 这里传空 deps，文章视图挂载时注册一次、卸载时注销，面板里的命令顺序也就稳定
  useRegisterCommands(cmds, []);
}
