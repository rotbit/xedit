"use client";

// 大纲导航（桌面）：从渲染结果提取 h1~h3，点击平滑跳转（分享页与阅读模式共用）

export function OutlineNav({
  outline,
  onJump,
  className = "hidden w-[190px] shrink-0 lg:block",
}: {
  outline: { level: number; text: string }[];
  onJump: (index: number) => void;
  /** 覆盖 <nav> 的外层类名（宽度 / 显隐 / 收缩），默认桌面 190px 窄列 */
  className?: string;
}) {
  return (
    <nav className={className}>
      <div className="sticky top-0 pt-1">
        <p className="mb-3 text-[12px] tracking-[0.15em] text-[var(--ink-faint)]">大纲</p>
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
