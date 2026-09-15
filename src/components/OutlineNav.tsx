"use client";

// 大纲导航（桌面）：从渲染结果提取 h1~h3，点击平滑跳转（分享页与阅读模式共用）

import { ChevronsLeft } from "lucide-react";

export function OutlineNav({
  outline,
  onJump,
  onClose,
  className = "hidden w-[190px] shrink-0 lg:block",
}: {
  outline: { level: number; text: string }[];
  onJump: (index: number) => void;
  /** 传了才出收起按钮（阅读模式可收，分享页常驻） */
  onClose?: () => void;
  /** 覆盖 <nav> 的外层类名（宽度 / 显隐 / 收缩），默认桌面 190px 窄列 */
  className?: string;
}) {
  return (
    <nav className={className}>
      <div className="sticky top-0 pt-1">
        {/* 标题行：可收起时右边挂《，与滚动区左上角的浮动入口对调 */}
        {onClose ? (
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] tracking-[0.15em] text-[var(--ink-faint)]">大纲</p>
            <button
              type="button"
              title="收起目录"
              aria-label="收起目录"
              onClick={onClose}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
            >
              <ChevronsLeft size={15} strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <p className="mb-3 text-[12px] tracking-[0.15em] text-[var(--ink-faint)]">大纲</p>
        )}
        <div className="flex flex-col gap-0.5">
          {outline.map((h, i) => (
            <button
              key={`${i}-${h.text}`}
              className="cursor-pointer truncate rounded-md px-2 py-1 text-left text-[12px] leading-relaxed text-[var(--ink-soft)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
              style={{ paddingLeft: 8 + (h.level - 1) * 14 }}
              title={h.text}
              onClick={() => onJump(i)}
            >
              {h.text}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
