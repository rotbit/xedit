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
} from "lucide-react";
import type { FormatCommand } from "./MarkdownEditor";

const BUTTONS: { cmd: FormatCommand; icon: React.ReactNode; label: string }[] = [
  { cmd: "bold", icon: <Bold size={14} />, label: "加粗" },
  { cmd: "italic", icon: <Italic size={14} />, label: "斜体" },
  { cmd: "strike", icon: <Strikethrough size={14} />, label: "删除线" },
  { cmd: "h1", icon: <Heading1 size={15} />, label: "一级标题" },
  { cmd: "h2", icon: <Heading2 size={15} />, label: "二级标题" },
  { cmd: "h3", icon: <Heading3 size={15} />, label: "三级标题" },
  { cmd: "quote", icon: <Quote size={13} />, label: "引用" },
  { cmd: "code", icon: <Code size={14} />, label: "行内代码" },
  { cmd: "codeblock", icon: <SquareCode size={14} />, label: "代码块" },
  { cmd: "link", icon: <Link2 size={14} />, label: "链接" },
  { cmd: "image", icon: <ImageIcon size={14} />, label: "图片" },
  { cmd: "table", icon: <Table size={14} />, label: "表格" },
  { cmd: "hr", icon: <Minus size={14} />, label: "分割线" },
];

export function EditorToolbar({ onCommand }: { onCommand: (cmd: FormatCommand) => void }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-[var(--hairline)] bg-[var(--panel)] px-2">
      {BUTTONS.map((b, i) => (
        <span key={b.cmd} className="flex items-center">
          {(i === 3 || i === 6 || i === 9) && (
            <span className="mx-1 h-4 w-px bg-[var(--hairline)]" />
          )}
          <button
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
            title={b.label}
            onClick={() => onCommand(b.cmd)}
          >
            {b.icon}
          </button>
        </span>
      ))}
      <span className="ml-auto pr-2 text-[11px] tracking-widest text-[var(--ink-faint)]">
        MARKDOWN
      </span>
    </div>
  );
}
