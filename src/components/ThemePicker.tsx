"use client";

/**
 * 主题选择面板：一屏用主题真实 CSS 渲染的缩略样张，加排版微调滑杆和新建 / 自定义 CSS 入口。
 * 隔离手法是把主题 CSS 里的 #nice 换成每张卡自己的 class；结构性基础样式则全面板共用一份。
 * 选中和微调都直接写 store，持久化由 store 负责，本文件不发请求。
 */
import { useMemo } from "react";
import { Check, Pencil, Plus, Code2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import {
  THEME_PRESETS,
  BASE_CSS,
  DEFAULT_TUNE,
  customThemeToPreset,
  CUSTOM_THEME_PREFIX,
  type ThemePreset,
} from "@/lib/themes";

/** 所有缩略图共用的作用域类：BASE_CSS 只按它注入一份（见 ThemePickerPanel） */
const THUMB_SCOPE = "tp-thumb";

/** 每张卡都注一份 BASE_CSS 就是 14+ 份 100KB 的重复文本，解析也重复 14 遍。
 *  改成模块级算一次、面板里注一次；注入点在卡片之前，
 *  同特异度下仍是「基础在前、主题在后」，主题照样覆盖基础 */
const BASE_THUMB_CSS = BASE_CSS.replaceAll("#nice", `.${THUMB_SCOPE}`);

/**
 * 主题缩略图：用主题真实 CSS 渲染一段迷你样张（标题/正文/引用），
 * 把选择器里的 #nice 换成本卡片的独立 class 实现隔离，再整体缩放。
 * 卡片自己只注入本主题那份差异 CSS，结构性基础样式由 THUMB_SCOPE 那一份提供。
 */
function ThemeThumb({ theme }: { theme: ThemePreset }) {
  // 自定义主题的 id 是带前缀的 UUID，可能含 CSS 类名里非法的字符，统一换成下划线
  const cls = `tp-${theme.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const css = useMemo(() => theme.css.replaceAll("#nice", `.${cls}`), [theme, cls]);

  return (
    <div className="light-lock pointer-events-none h-[88px] overflow-hidden rounded-[5px] bg-white">
      <style>{css}</style>
      <div
        className={`${THUMB_SCOPE} ${cls}`}
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

/** 一张主题卡：缩略样张 + 名称 + 标签；自定义主题额外挂一个悬停才出现的编辑按钮。 */
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
              // 编辑按钮压在卡片上，必须拦住冒泡，否则点「编辑」会顺带把这套主题选中
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

/** 排版微调滑杆行 */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    // 面板挂在下拉菜单里，拖滑杆产生的点击必须就地拦住，否则菜单会当成「点了外面」而收起
    <div className="flex items-center gap-2.5 px-3.5 py-1.5" onClick={(e) => e.stopPropagation()}>
      <span className="w-7 shrink-0 text-[12px] text-[var(--ink-soft)]">{label}</span>
      <input
        type="range"
        className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-11 shrink-0 text-right text-[11.5px] text-[var(--ink-faint)] [font-family:var(--mono)]">
        {value}
        {unit}
      </span>
    </div>
  );
}

/** 排版微调区块：字号 / 行高 / 段距三档滑杆 + 一键重置，跟在主题网格后面 */
function TypographyTuner() {
  const tuneFontSize = useStore((s) => s.tuneFontSize);
  const tuneLineHeight = useStore((s) => s.tuneLineHeight);
  const tuneParaSpacing = useStore((s) => s.tuneParaSpacing);
  const setTune = useStore((s) => s.setTune);

  return (
    <>
      <p className="px-3.5 pb-0.5 pt-0.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
        排版微调
      </p>
      <SliderRow
        label="字号"
        value={tuneFontSize}
        // 三档的取值范围是刻意收窄的：超出这个区间，在公众号正文里就不像正常排版了
        min={14}
        max={18}
        step={0.5}
        unit="px"
        onChange={(v) => setTune({ tuneFontSize: v })}
      />
      <SliderRow
        label="行高"
        value={tuneLineHeight}
        min={1.5}
        max={2.2}
        step={0.05}
        unit=""
        onChange={(v) => setTune({ tuneLineHeight: v })}
      />
      <SliderRow
        label="段距"
        value={tuneParaSpacing}
        min={8}
        max={28}
        step={2}
        unit="px"
        onChange={(v) => setTune({ tuneParaSpacing: v })}
      />
      <button
        className="mx-3.5 my-1 cursor-pointer rounded px-1.5 py-0.5 text-[11.5px] text-[var(--ink-faint)] hover:text-[var(--accent)]"
        onClick={(e) => {
          e.stopPropagation();
          setTune({ ...DEFAULT_TUNE });
        }}
      >
        重置排版微调
      </button>
    </>
  );
}

/** 面板主体，挂在顶栏「主题」下拉里；自身滚动，最高 72vh，底部按钮条固定。 */
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
      {/* 缩略图的结构性基础样式，全面板共用这一份；必须排在卡片之前，
          这样主题 CSS 在后、同特异度时照旧覆盖它 */}
      <style>{BASE_THUMB_CSS}</style>
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

      {/* 排版微调：跟主题一样是「文章长什么样」的调节，收在主题面板末尾，与网格用细线隔开 */}
      <div className="border-t border-[var(--hairline)] py-1.5">
        <TypographyTuner />
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-[var(--hairline-soft)] bg-[var(--panel)] px-3 py-2.5">
        <button className={footBtn} onClick={() => setThemeStudio("new")}>
          <Plus size={14} />
          新建主题
        </button>
        <button className={footBtn} onClick={() => setCssDialogOpen(true)}>
          <Code2 size={14} />
          自定义 CSS
        </button>
      </div>
    </div>
  );
}

// 供外部（如设置菜单）判断某 id 是否自定义主题
export { CUSTOM_THEME_PREFIX };
