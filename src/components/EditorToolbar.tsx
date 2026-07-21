"use client";

import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  SquareCode,
  Link2,
  Image as ImageIcon,
  Table,
  Minus,
  ListTree,
} from "lucide-react";
import type { FormatCommand } from "./MarkdownEditor";

/** 统一的图标尺寸与描边：略细的描边让整条工具栏更秀气、更一致 */
const ICON = 15;
const STROKE = 1.75;

const BUTTONS: { cmd: FormatCommand; icon: React.ReactNode; label: string }[] = [
  { cmd: "bold", icon: <Bold size={ICON} strokeWidth={STROKE} />, label: "加粗" },
  { cmd: "italic", icon: <Italic size={ICON} strokeWidth={STROKE} />, label: "斜体" },
  { cmd: "strike", icon: <Strikethrough size={ICON} strokeWidth={STROKE} />, label: "删除线" },
  { cmd: "h1", icon: <Heading1 size={ICON} strokeWidth={STROKE} />, label: "一级标题" },
  { cmd: "h2", icon: <Heading2 size={ICON} strokeWidth={STROKE} />, label: "二级标题" },
  { cmd: "h3", icon: <Heading3 size={ICON} strokeWidth={STROKE} />, label: "三级标题" },
  { cmd: "quote", icon: <Quote size={ICON} strokeWidth={STROKE} />, label: "引用" },
  { cmd: "code", icon: <Code size={ICON} strokeWidth={STROKE} />, label: "行内代码" },
  { cmd: "codeblock", icon: <SquareCode size={ICON} strokeWidth={STROKE} />, label: "代码块" },
  { cmd: "link", icon: <Link2 size={ICON} strokeWidth={STROKE} />, label: "链接" },
  { cmd: "image", icon: <ImageIcon size={ICON} strokeWidth={STROKE} />, label: "图片" },
  { cmd: "table", icon: <Table size={ICON} strokeWidth={STROKE} />, label: "表格" },
  { cmd: "hr", icon: <Minus size={ICON} strokeWidth={STROKE} />, label: "分割线" },
];

/** 分组分隔线：在这些下标前插入一根细竖线，让功能按类聚拢 */
const GROUP_BREAKS = new Set([3, 6, 9]);

const btnBase =
  "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors duration-100";

const Divider = () => (
  <span className="mx-1 h-4 w-px shrink-0 rounded bg-[var(--hairline)]" />
);

export function EditorToolbar({
  onCommand,
  outlineOpen,
  onToggleOutline,
}: {
  onCommand: (cmd: FormatCommand) => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--hairline)] bg-[var(--panel)] px-2.5">
      <button
        className={`${btnBase} ${
          outlineOpen
            ? "bg-[var(--accent-wash)] text-[var(--accent)]"
            : "text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
        }`}
        title="大纲"
        onClick={onToggleOutline}
      >
        <ListTree size={ICON} strokeWidth={STROKE} />
      </button>
      <Divider />
      {BUTTONS.map((b, i) => (
        <span key={b.cmd} className="flex shrink-0 items-center">
          {GROUP_BREAKS.has(i) && <Divider />}
          <button
            className={`${btnBase} text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--ink)] active:scale-90`}
            title={b.label}
            onClick={() => onCommand(b.cmd)}
          >
            {b.icon}
          </button>
        </span>
      ))}
    </div>
  );
}
