"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import { useStore } from "@/store/useStore";
import { THEME_PRESETS, BASE_CSS, type ThemePreset } from "@/lib/themes";

/**
 * 主题缩略图：用主题真实 CSS 渲染一段迷你样张（标题/正文/引用），
 * 把选择器里的 #nice 换成本卡片的独立 class 实现隔离，再整体缩放。
 */
function ThemeThumb({ theme }: { theme: ThemePreset }) {
  const cls = `tp-${theme.id}`;
  const css = useMemo(
    () => (BASE_CSS + theme.css).replaceAll("#nice", `.${cls}`),
    [theme, cls]
  );

  return (
    <div className="pointer-events-none h-[88px] overflow-hidden rounded-[5px] bg-white">
      <style>{css}</style>
      <div
        className={cls}
        style={{
          transform: "scale(0.5)",
          transformOrigin: "top left",
          width: "200%",
          padding: "12px 16px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 10 }}>
          <span className="prefix" />
          <span className="content">标题样式</span>
          <span className="suffix" />
        </h2>
        <p style={{ margin: "8px 0" }}>
          正文文字，<strong>重点强调</strong>与<a>链接</a>的样子。
        </p>
        <blockquote style={{ margin: "10px 0" }}>
          <p style={{ margin: "6px 0" }}>引用内容的样式</p>
        </blockquote>
      </div>
    </div>
  );
}

export function ThemePickerPanel() {
  const themeId = useStore((s) => s.themeId);
  const setThemeId = useStore((s) => s.setThemeId);

  return (
    <div className="max-h-[72vh] overflow-y-auto">
      <p className="px-3.5 pb-1.5 pt-1.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
        排版主题
      </p>
      <div className="grid grid-cols-2 gap-2.5 px-3 pb-2">
        {THEME_PRESETS.map((t) => {
          const active = t.id === themeId;
          return (
            <button
              key={t.id}
              className="group cursor-pointer text-left"
              onClick={() => setThemeId(t.id)}
            >
              <div
                className={`rounded-md p-[2px] transition-shadow ${
                  active
                    ? "ring-2 ring-[var(--accent)]"
                    : "ring-1 ring-[var(--hairline)] group-hover:ring-[var(--hairline-strong)]"
                }`}
              >
                <ThemeThumb theme={t} />
              </div>
              <div className="flex items-center justify-between px-0.5 pt-1.5">
                <span
                  className={`flex items-center gap-1 text-[12.5px] ${
                    active ? "font-medium text-[var(--accent-deep)]" : "text-[var(--ink)]"
                  }`}
                >
                  {active ? <Check size={12} /> : null}
                  {t.name}
                </span>
                <span className="text-[10.5px] text-[var(--ink-faint)]">{t.tag}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
