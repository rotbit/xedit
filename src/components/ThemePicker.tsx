"use client";

import { useMemo } from "react";
import { Check, Pencil, Plus, Code2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import {
  THEME_PRESETS,
  BASE_CSS,
  customThemeToPreset,
  CUSTOM_THEME_PREFIX,
  type ThemePreset,
} from "@/lib/themes";

/**
 * 主题缩略图：用主题真实 CSS 渲染一段迷你样张（标题/正文/引用），
 * 把选择器里的 #nice 换成本卡片的独立 class 实现隔离，再整体缩放。
 */
function ThemeThumb({ theme }: { theme: ThemePreset }) {
  const cls = `tp-${theme.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const css = useMemo(
    () => (BASE_CSS + theme.css).replaceAll("#nice", `.${cls}`),
    [theme, cls]
  );

  return (
    <div className="light-lock pointer-events-none h-[88px] overflow-hidden rounded-[5px] bg-white">
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

function ThemeCard({
  theme,
  active,
  onSelect,
  onEdit,
}: {
  theme: ThemePreset;
  active: boolean;
  onSelect: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className="group cursor-pointer text-left" onClick={onSelect}>
      <div
        className={`relative rounded-md p-[2px] transition-shadow ${
          active
            ? "ring-2 ring-[var(--accent)]"
            : "ring-1 ring-[var(--hairline)] group-hover:ring-[var(--hairline-strong)]"
        }`}
      >
        <ThemeThumb theme={theme} />
        {onEdit ? (
          <button
            className="absolute right-1.5 top-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-black/45 text-white opacity-0 transition-opacity hover:bg-black/65 group-hover:opacity-100"
            title="编辑主题"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil size={12} />
          </button>
        ) : null}
      </div>
      <div className="flex items-center justify-between px-0.5 pt-1.5">
        <span
          className={`flex items-center gap-1 text-[12.5px] ${
            active ? "font-medium text-[var(--accent-deep)]" : "text-[var(--ink)]"
          }`}
        >
          {active ? <Check size={12} /> : null}
          {theme.name}
        </span>
        <span className="text-[10.5px] text-[var(--ink-faint)]">{theme.tag}</span>
      </div>
    </div>
  );
}

export function ThemePickerPanel() {
  const themeId = useStore((s) => s.themeId);
  const setThemeId = useStore((s) => s.setThemeId);
  const customThemes = useStore((s) => s.customThemes);
  const setThemeStudio = useStore((s) => s.setThemeStudio);
  const setCssDialogOpen = useStore((s) => s.setCssDialogOpen);

  const footBtn =
    "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] px-3 py-2 text-[12.5px] text-[var(--ink)] hover:bg-[var(--paper)]";

  return (
    <div className="max-h-[72vh] overflow-y-auto">
      {customThemes.length > 0 ? (
        <>
          <p className="px-3.5 pb-1.5 pt-1.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
            我的主题
          </p>
          <div className="grid grid-cols-2 gap-2.5 px-3 pb-2">
            {customThemes.map((spec) => {
              const preset = customThemeToPreset(spec);
              return (
                <ThemeCard
                  key={preset.id}
                  theme={preset}
                  active={preset.id === themeId}
                  onSelect={() => setThemeId(preset.id)}
                  onEdit={() => setThemeStudio(spec.id)}
                />
              );
            })}
          </div>
        </>
      ) : null}

      <p className="px-3.5 pb-1.5 pt-1.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
        排版主题
      </p>
      <div className="grid grid-cols-2 gap-2.5 px-3 pb-2">
        {THEME_PRESETS.map((t) => (
          <ThemeCard
            key={t.id}
            theme={t}
            active={t.id === themeId}
            onSelect={() => setThemeId(t.id)}
          />
        ))}
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-[var(--hairline-soft)] bg-[var(--panel)] px-3 py-2.5">
        <button className={footBtn} onClick={() => setThemeStudio("new")}>
          <Plus size={13} />
          新建主题
        </button>
        <button className={footBtn} onClick={() => setCssDialogOpen(true)}>
          <Code2 size={13} />
          自定义 CSS
        </button>
      </div>
    </div>
  );
}

// 供外部（如设置菜单）判断某 id 是否自定义主题
export { CUSTOM_THEME_PREFIX };
