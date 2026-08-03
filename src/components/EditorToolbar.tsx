"use client";

import { useState } from "react";
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
import { Dropdown, menuItemCls } from "./Dropdown";
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

/** 字体颜色色板：常用的正文强调色，深浅主题下都够醒目 */
const TEXT_COLORS = [
  { value: "#e11d48", label: "玫红" },
  { value: "#ea580c", label: "橙" },
  { value: "#d97706", label: "琥珀" },
  { value: "#16a34a", label: "绿" },
  { value: "#0d9488", label: "青" },
  { value: "#2563eb", label: "蓝" },
  { value: "#7c3aed", label: "紫" },
  { value: "#db2777", label: "粉" },
  { value: "#64748b", label: "灰" },
  { value: "#92400e", label: "棕" },
];

/** 字体颜色按钮：A + 最近用色的色条，点开色板；null = 清除颜色 */
function ColorPicker({ onPick }: { onPick: (color: string | null) => void }) {
  const [last, setLast] = useState(TEXT_COLORS[0].value);
  const pick = (color: string | null) => {
    if (color) setLast(color);
    onPick(color);
  };
  return (
    <Dropdown
      align="left"
      width={190}
      trigger={
        <button className={btnBase} title="字体颜色">
          <span className="flex flex-col items-center leading-none">
            <span className="text-[13px] font-semibold leading-none [font-family:var(--sans)]">
              A
            </span>
            <span
              className="mt-[2px] h-[3px] w-[14px] rounded-full"
              style={{ background: last }}
            />
          </span>
        </button>
      }
    >
      <div className="grid grid-cols-5 justify-items-center gap-1.5 px-3 pb-2 pt-1">
        {TEXT_COLORS.map((c) => (
          <button
            key={c.value}
            className="h-6 w-6 cursor-pointer rounded-full border border-black/10 transition-transform duration-100 hover:scale-110"
            style={{ background: c.value }}
            title={c.label}
            onClick={() => pick(c.value)}
          />
        ))}
      </div>
      {/* 自定义取色要连续调色，点击不收起面板 */}
      <div
        className="border-t border-[var(--hairline-soft)] px-3.5 py-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <label className="flex cursor-pointer items-center justify-between gap-2 text-[13px] text-[var(--ink)]">
          自定义
          <input
            type="color"
            className="h-6 w-9 cursor-pointer rounded border border-[var(--hairline)] bg-transparent p-0"
            defaultValue={last}
            onChange={(e) => pick(e.target.value)}
          />
        </label>
      </div>
      <button className={menuItemCls} onClick={() => pick(null)}>
        清除颜色
      </button>
    </Dropdown>
  );
}

export function EditorToolbar({
  onCommand,
  outlineOpen,
  onToggleOutline,
  centered = false,
}: {
  onCommand: (cmd: FormatCommand, arg?: string) => void;
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
            {b.cmd === "strike" ? (
              <ColorPicker onPick={(color) => onCommand("color", color ?? undefined)} />
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
