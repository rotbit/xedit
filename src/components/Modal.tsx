"use client";

import { X } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";

/** 弹窗里的主按钮：确定 / 保存 / 开始同步… */
export const btnPrimary =
  "flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-deep)] disabled:opacity-60";

/** 弹窗里的次级按钮：停止 / 取消这类描边按钮 */
export const btnSecondary =
  "flex cursor-pointer items-center rounded-md border border-[var(--hairline-strong)] px-4 py-1.5 text-[13px] text-[var(--ink-soft)] hover:bg-[var(--paper)] disabled:opacity-60";

/**
 * 带标题栏的功能弹窗外壳：遮罩 + 面板 + 48px 标题栏（图标 + 标题 + X）+ Esc 关闭。
 * 飞书导入 / Markdown 导入 / 自定义 CSS 共用，三者只差尺寸与层级，用 prop 表达；
 * 面板本身是纵向 flex，内容区自己决定滚动还是撑满。
 */
export function Modal({
  title,
  icon,
  width,
  height,
  maxWidth = "94vw",
  maxHeight = "92vh",
  z = 95,
  locked = false,
  onClose,
  children,
}: {
  title: string;
  /** 标题左侧的小图标；不传时标题栏不进 flex 布局，与原来的纯文字标题逐字一致 */
  icon?: React.ReactNode;
  width: number;
  /** 固定高度（自定义 CSS 那种编辑器面板要定高），不传则由内容撑开 */
  height?: number;
  maxWidth?: string;
  maxHeight?: string;
  /** 叠放层级：导入类 95，主题/CSS 类 90 */
  z?: number;
  /** 锁住关闭入口（如导入进行中）：遮罩、Esc、X 都不响应 */
  locked?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEscape(onClose, !locked);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      style={{ zIndex: z }}
      onClick={() => {
        if (!locked) onClose();
      }}
    >
      <div
        className="flex flex-col overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        style={{ width, height, maxWidth, maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4">
          <span
            className={
              icon
                ? "flex items-center gap-2 text-[14px] font-medium [font-family:var(--serif)]"
                : "text-[14px] font-medium [font-family:var(--serif)]"
            }
          >
            {icon}
            {title}
          </span>
          <button
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)] disabled:opacity-40"
            onClick={onClose}
            disabled={locked}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * 稿纸风格的轻弹窗外壳：淡遮罩 + toast-in 弹入的圆角面板，标题行与按钮区由 children 自带。
 * askInput / askConfirm / askCategoryPick / 登录弹窗共用——它们比 Modal 更轻（无标题栏、无 X），
 * 所以是第二种外壳而不是给 Modal 加开关。
 */
export function PaperDialog({
  width,
  maxWidth = "92vw",
  z = 110,
  padded = false,
  panelClass = "",
  onClose,
  children,
}: {
  width: number;
  maxWidth?: string;
  z?: number;
  /** 遮罩留 16px 白边：内容较高的登录弹窗在窄屏上不贴边 */
  padded?: boolean;
  /** 面板追加类：分类选择要纵向 flex + 限高滚动 */
  panelClass?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // 面板渲染出来才挂 Esc，等价于各宿主原来的 `useEscape(cancel, 打开中)`
  useEscape(onClose);

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[2px] ${padded ? "p-4" : ""}`}
      style={{ zIndex: z }}
      onClick={onClose}
    >
      <div
        className={`toast-in overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_24px_70px_-16px_rgba(40,25,5,0.4)] ${panelClass}`}
        style={{ width, maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
