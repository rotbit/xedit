"use client";

/**
 * 自定义主题编辑器：左侧调参数，右侧用正式渲染那套 CSS 实时出样张，保存后写进 store 并立刻应用。
 * 用户只需要选一个主色，深浅底色、边框、强调色都由 buildCustomThemeCss 派生，所以这里没有多个颜色输入。
 * 预览时把主题 CSS 里的 #nice 换成 PREVIEW_SCOPE，否则编辑器自身的界面也会被主题样式染到。
 */
import { useMemo, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useEscape } from "@/hooks/useEscape";
import { toast } from "./Toast";
import { askConfirm } from "./PromptDialog";
import {
  BASE_CSS,
  buildCustomThemeCss,
  defaultCustomSpec,
  HEADING_STYLE_OPTIONS,
  QUOTE_STYLE_OPTIONS,
  LINK_STYLE_OPTIONS,
  CUSTOM_THEME_PREFIX,
  type CustomThemeSpec,
} from "@/lib/themes";

/** 常用主色快捷色板 */
const SWATCHES = [
  "#1e6bb8",
  "#07c160",
  "#0e9285",
  "#e8618c",
  "#ef7060",
  "#c0392b",
  "#8e44ad",
  "#576b95",
  "#d97706",
  "#4f46e5",
  "#0891b2",
  "#333333",
];

// 预览容器的专属作用域类。主题 CSS 都是以 #nice 为根写的，替换成这个 class 才能把影响限制在右侧样张里
const PREVIEW_SCOPE = "ts-pv";

/** 分组小标题的样式；first:mt-0 让第一组不带顶部间距 */
const LABEL_CLS = "mb-1.5 mt-4 block text-[11.5px] tracking-wider text-[var(--ink-faint)] first:mt-0";

function SegBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-[12px] transition-colors ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent-deep)]"
          : "border-[var(--hairline)] text-[var(--ink-soft)] hover:border-[var(--hairline-strong)]"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** 只判断要不要开；真正的编辑逻辑在 ThemeStudioInner。 */
export function ThemeStudio() {
  const mode = useStore((s) => s.themeStudio);
  if (mode === "closed") return null;
  // key 绑在 mode 上：从「编辑 A」切到「编辑 B」或「新建」时强制重建组件，否则 draft 的初始值不会重新取
  return <ThemeStudioInner key={mode} />;
}

function ThemeStudioInner() {
  const mode = useStore((s) => s.themeStudio);
  const setThemeStudio = useStore((s) => s.setThemeStudio);
  const saveCustomTheme = useStore((s) => s.saveCustomTheme);
  const removeCustomTheme = useStore((s) => s.removeCustomTheme);
  const setThemeId = useStore((s) => s.setThemeId);

  // 用 getState() 取一次而不是订阅：草稿只需要挂载时的初始值，保存过程中 store 的变动不该回灌到正在填的表单
  const editing = useStore.getState().customThemes.find((t) => t.id === mode) ?? null;
  const [draft, setDraft] = useState<Omit<CustomThemeSpec, "id">>(() => {
    if (editing) {
      const rest = { ...editing } as Partial<CustomThemeSpec>;
      delete rest.id;
      return rest as Omit<CustomThemeSpec, "id">;
    }
    return defaultCustomSpec();
  });
  const [hexDraft, setHexDraft] = useState(draft.accent);

  useEscape(() => setThemeStudio("closed"));

  const patch = (p: Partial<Omit<CustomThemeSpec, "id">>) => setDraft((d) => ({ ...d, ...p }));
  const setAccent = (accent: string) => {
    setHexDraft(accent);
    // hex 输入框允许中间态（用户正打到一半），只有合法的六位色值才推进草稿，否则预览会一直闪
    if (/^#[0-9a-f]{6}$/i.test(accent)) patch({ accent });
  };

  const previewCss = useMemo(() => {
    // 预览和正式渲染共用同一套 BASE_CSS + 生成 CSS，样张才不会和实际发出去的效果有偏差
    const css = BASE_CSS + buildCustomThemeCss({ ...draft, id: "preview" });
    return css.replaceAll("#nice", `.${PREVIEW_SCOPE}`);
  }, [draft]);

  const save = () => {
    // 编辑时保留原 id（别的设备还在引用它），只有新建才生成；保存完顺手切到这套主题
    const id = editing?.id ?? crypto.randomUUID();
    saveCustomTheme({ ...draft, id, name: draft.name.trim() || "我的主题" });
    setThemeId(CUSTOM_THEME_PREFIX + id);
    setThemeStudio("closed");
    toast("主题已保存并应用", "success");
  };

  const remove = async () => {
    if (!editing) return;
    const ok = await askConfirm({
      title: "删除这套主题",
      message: `「${editing.name}」将被删除；正在使用它的设备会回落到默认主题。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    removeCustomTheme(editing.id);
    setThemeStudio("closed");
    toast("已删除", "success");
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      // 点遮罩关闭；下面的面板自己 stopPropagation，所以点内容不会误关
      onClick={() => setThemeStudio("closed")}
    >
      <div
        className="flex h-[580px] max-h-[92vh] w-[880px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4">
          <span className="text-[14px] font-medium [font-family:var(--serif)]">
            {editing ? "编辑主题" : "新建主题"}
          </span>
          <button
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]"
            onClick={() => setThemeStudio("closed")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 左：参数控件 */}
          <div className="w-[300px] shrink-0 overflow-y-auto border-r border-[var(--hairline)] p-4">
            <label className={LABEL_CLS}>主题名称</label>
            <input
              className="h-9 w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--paper)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              value={draft.name}
              maxLength={30}
              placeholder="我的主题"
              onChange={(e) => patch({ name: e.target.value })}
            />

            <label className={LABEL_CLS}>主色</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 cursor-pointer rounded-md border border-[var(--hairline-strong)] bg-transparent p-0.5"
                value={draft.accent}
                onChange={(e) => setAccent(e.target.value)}
              />
              <input
                className="h-9 flex-1 rounded-lg border border-[var(--hairline-strong)] bg-[var(--paper)] px-3 text-[13px] text-[var(--ink)] outline-none [font-family:var(--mono)] focus:border-[var(--accent)]"
                value={hexDraft}
                spellCheck={false}
                onChange={(e) => setAccent(e.target.value.trim())}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  className={`h-6 w-6 cursor-pointer rounded-full border-2 transition-transform hover:scale-110 ${
                    draft.accent.toLowerCase() === c ? "border-[var(--ink)]" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                  onClick={() => setAccent(c)}
                />
              ))}
            </div>

            <label className={LABEL_CLS}>章节标题（H2）造型</label>
            <div className="flex flex-wrap gap-1.5">
              {HEADING_STYLE_OPTIONS.map((o) => (
                <SegBtn
                  key={o.value}
                  active={draft.headingStyle === o.value}
                  onClick={() => patch({ headingStyle: o.value })}
                >
                  {o.label}
                </SegBtn>
              ))}
            </div>

            {draft.headingStyle !== "wings" && draft.headingStyle !== "bar" ? (
              <>
                <label className={LABEL_CLS}>标题对齐</label>
                <div className="flex gap-1.5">
                  <SegBtn
                    active={draft.headingAlign === "left"}
                    onClick={() => patch({ headingAlign: "left" })}
                  >
                    居左
                  </SegBtn>
                  <SegBtn
                    active={draft.headingAlign === "center"}
                    onClick={() => patch({ headingAlign: "center" })}
                  >
                    居中
                  </SegBtn>
                </div>
              </>
            ) : null}

            <label className={LABEL_CLS}>引用块</label>
            <div className="flex flex-wrap gap-1.5">
              {QUOTE_STYLE_OPTIONS.map((o) => (
                <SegBtn
                  key={o.value}
                  active={draft.quoteStyle === o.value}
                  onClick={() => patch({ quoteStyle: o.value })}
                >
                  {o.label}
                </SegBtn>
              ))}
            </div>

            <label className={LABEL_CLS}>链接样式</label>
            <div className="flex flex-wrap gap-1.5">
              {LINK_STYLE_OPTIONS.map((o) => (
                <SegBtn
                  key={o.value}
                  active={draft.linkStyle === o.value}
                  onClick={() => patch({ linkStyle: o.value })}
                >
                  {o.label}
                </SegBtn>
              ))}
            </div>

            <label className={LABEL_CLS}>圆角（引用块 / 色块） {draft.radius}px</label>
            <input
              type="range"
              min={0}
              max={16}
              step={1}
              value={draft.radius}
              className="w-full accent-[var(--accent)]"
              onChange={(e) => patch({ radius: Number(e.target.value) })}
            />

            <div className="mt-4 flex flex-col gap-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--ink)]">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={draft.strongAccent}
                  onChange={(e) => patch({ strongAccent: e.target.checked })}
                />
                加粗文字用主色
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--ink)]">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={draft.serif}
                  onChange={(e) => patch({ serif: e.target.checked })}
                />
                正文用衬线字体（适合文化/散文类）
              </label>
            </div>
          </div>

          {/* 右：实时预览（与正式渲染同一套 base + 生成 CSS） */}
          {/* light-lock：样张永远按浅色底渲染——公众号里没有深色模式，深色下预览会骗人 */}
          <div className="light-lock min-w-0 flex-1 overflow-y-auto bg-white">
            <style>{previewCss}</style>
            <div className={PREVIEW_SCOPE} style={{ maxWidth: 420, margin: "0 auto" }}>
              <h2 style={{ marginTop: 24 }}>
                <span className="prefix" />
                <span className="content">章节标题的样子</span>
                <span className="suffix" />
              </h2>
              <p>
                正文段落里有<strong>加粗强调</strong>、<em>斜体语气</em>、
                <a>一个链接</a>，还有行内代码 <code>npm run build</code> 的样式。
              </p>
              <blockquote>
                <p>引用块：好的排版是读者感觉不到排版的存在。</p>
              </blockquote>
              <h3>
                <span className="prefix" />
                <span className="content">三级标题</span>
                <span className="suffix" />
              </h3>
              <ul>
                <li>列表项的行距与标记</li>
                <li>第二项，检查间距是否舒服</li>
              </ul>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>功能</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>公众号复制</td>
                      <td>✅ 支持</td>
                    </tr>
                    <tr>
                      <td>斑马纹表格</td>
                      <td>✅ 支持</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <hr />
              <p>
                分割线之后的收尾段落，用来看<strong>整体的呼吸感</strong>。
              </p>
              <div style={{ height: 24 }} />
            </div>
          </div>
        </div>

        <div className="flex h-14 shrink-0 items-center justify-between border-t border-[var(--hairline)] px-4">
          {editing ? (
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] text-red-500 hover:bg-red-500/10"
              onClick={() => void remove()}
            >
              <Trash2 size={14} />
              删除主题
            </button>
          ) : (
            <p className="text-[12px] text-[var(--ink-faint)]">
              颜色只填一个主色，深浅底色与边框自动派生
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="cursor-pointer rounded-md border border-[var(--hairline-strong)] px-3.5 py-1.5 text-[13px] hover:bg-[var(--paper)]"
              onClick={() => setThemeStudio("closed")}
            >
              取消
            </button>
            <button
              className="cursor-pointer rounded-md bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-deep)]"
              onClick={save}
            >
              保存并应用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
