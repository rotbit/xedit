"use client";

// 字体颜色选择器（从原常驻工具栏 EditorToolbar 抽出，现由浮动工具条复用）。

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { menuItemCls } from "./Dropdown";

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

const PANEL_W = 190;

/**
 * 字体颜色按钮：A + 最近用色的色条，点开色板；null = 清除颜色。
 * 宿主（浮动工具条）本身是 36px 高的窄胶囊，普通绝对定位的下拉会被裁掉，
 * 所以色板用 portal 挂到 body、fixed 定位到按钮下方。
 */
export function ColorPicker({
  onPick,
  className,
  onOpenChange,
}: {
  onPick: (color: string | null) => void;
  /** 触发按钮的样式由宿主给，保证与同排按钮尺寸一致 */
  className: string;
  /** 色板开合通知宿主：色板开着时编辑器会失焦，宿主据此别把自己收起来。
   *  会进 effect 依赖，宿主请传稳定引用 */
  onOpenChange?: (open: boolean) => void;
}) {
  const [last, setLast] = useState(TEXT_COLORS[0].value);
  const [panel, setPanel] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (panel) return setPanel(null);
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // 贴按钮左缘；右侧出屏时往回收
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8));
    setPanel({ left, top: r.bottom + 6 });
  };

  // 开合状态同步给宿主；卸载时按「已关闭」上报，免得宿主的挂起标记漏清
  useEffect(() => {
    onOpenChange?.(panel !== null);
    return () => onOpenChange?.(false);
  }, [panel, onOpenChange]);

  // 点面板和按钮以外的地方收起
  useEffect(() => {
    if (!panel) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setPanel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(null);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  const pick = (color: string | null) => {
    if (color) setLast(color);
    onPick(color);
  };

  return (
    <>
      <button ref={btnRef} className={className} title="字体颜色" onClick={toggle}>
        <span className="flex flex-col items-center leading-none">
          <span className="text-[13px] font-semibold leading-none [font-family:var(--sans)]">
            A
          </span>
          <span className="mt-[2px] h-[3px] w-[14px] rounded-full" style={{ background: last }} />
        </span>
      </button>
      {panel
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[80] rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
              style={{ left: panel.left, top: panel.top, width: PANEL_W }}
              // 色板挂在 body 上，宿主的「按下不夺焦」拦不到这里：色块/清除自己拦一次，
              // 编辑器就不会失焦、选区也不会被清掉。取色输入框要拿焦点才能弹系统取色器，放行
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault();
              }}
            >
              <div className="grid grid-cols-5 justify-items-center gap-1.5 px-3 pb-2 pt-1">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className="h-6 w-6 cursor-pointer rounded-full border border-black/10 transition-transform duration-100 hover:scale-110"
                    style={{ background: c.value }}
                    title={c.label}
                    onClick={() => {
                      pick(c.value);
                      setPanel(null);
                    }}
                  />
                ))}
              </div>
              {/* 自定义取色要连续调色，选色期间面板保持展开 */}
              <div className="border-t border-[var(--hairline-soft)] px-3.5 py-1.5">
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
              <button
                className={menuItemCls}
                onClick={() => {
                  pick(null);
                  setPanel(null);
                }}
              >
                清除颜色
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
