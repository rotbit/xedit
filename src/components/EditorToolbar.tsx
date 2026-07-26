"use client";

import {
  Bold,
  Italic,
  Strikethrough,
  Quote,
  Code,
  SquareCode,
  Link2,
  Image as ImageIcon,
  Film,
  Table,
  Minus,
  ListTree,
} from "lucide-react";
import type { FormatCommand } from "./MarkdownEditor";

/** 统一的图标尺寸与描边：略细的描边让整条工具栏更秀气、更一致 */
const ICON = 16;
const STROKE = 1.75;

/** 标题按钮不用 lucide 的 H₁/H₂/H₃（下标拥挤、辨识度差），改用清晰的字面「H1/H2/H3」 */
function HeadingGlyph({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="flex items-baseline font-semibold leading-none tracking-tight [font-family:var(--sans)]">
      <span className="text-[13px]">H</span>
      <span className="text-[9.5px]">{level}</span>
    </span>
  );
}

type Btn = { cmd: FormatCommand; icon: React.ReactNode; label: string };

const BUTTONS: Btn[] = [
  { cmd: "bold", icon: <Bold size={ICON} strokeWidth={STROKE} />, label: "加粗" },
  { cmd: "italic", icon: <Italic size={ICON} strokeWidth={STROKE} />, label: "斜体" },
  { cmd: "strike", icon: <Strikethrough size={ICON} strokeWidth={STROKE} />, label: "删除线" },
  { cmd: "h1", icon: <HeadingGlyph level={1} />, label: "一级标题" },
  { cmd: "h2", icon: <HeadingGlyph level={2} />, label: "二级标题" },
  { cmd: "h3", icon: <HeadingGlyph level={3} />, label: "三级标题" },
  { cmd: "quote", icon: <Quote size={ICON} strokeWidth={STROKE} />, label: "引用" },
  { cmd: "code", icon: <Code size={ICON} strokeWidth={STROKE} />, label: "行内代码" },
  { cmd: "codeblock", icon: <SquareCode size={ICON} strokeWidth={STROKE} />, label: "代码块" },
  { cmd: "link", icon: <Link2 size={ICON} strokeWidth={STROKE} />, label: "链接" },
  { cmd: "image", icon: <ImageIcon size={ICON} strokeWidth={STROKE} />, label: "图片" },
  { cmd: "video", icon: <Film size={ICON} strokeWidth={STROKE} />, label: "视频（上传）" },
  { cmd: "table", icon: <Table size={ICON} strokeWidth={STROKE} />, label: "表格" },
  { cmd: "hr", icon: <Minus size={ICON} strokeWidth={STROKE} />, label: "分割线" },
];

/** 分组分隔线：在这些下标前插入一根细竖线，让功能按类聚拢 */
const GROUP_BREAKS = new Set([3, 6, 9]);

const btnBase =
  "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--ink-soft)] transition-colors duration-100 hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] active:scale-90";

const Divider = () => (
  <span className="mx-1.5 h-4 w-px shrink-0 rounded bg-[var(--hairline)]" />
);

export function EditorToolbar({
  onCommand,
  outlineOpen,
  onToggleOutline,
  centered = false,
}: {
  onCommand: (cmd: FormatCommand) => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  /** 与单屏正文同轴：内容居中约束在正文可读宽度内（左缘对齐正文文字） */
  centered?: boolean;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center overflow-x-auto border-b border-[var(--hairline-soft)] bg-[var(--panel)]">
      <div
        className={`flex items-center gap-0.5 ${
          centered ? "mx-auto w-full min-w-fit max-w-[760px] px-2" : "px-3"
        }`}
      >
        <button
          className={`${btnBase} ${
            outlineOpen ? "bg-[var(--accent-wash)] text-[var(--accent)]" : ""
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
            <button className={btnBase} title={b.label} onClick={() => onCommand(b.cmd)}>
              {b.icon}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
