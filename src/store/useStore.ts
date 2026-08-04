import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import type { CustomThemeSpec } from "@/lib/themes/custom";

/** pending：已存本地镜像、等待联网后同步云端 */
export type SaveState = "local" | "saving" | "saved" | "pending" | "error";

export const DEFAULT_MARKDOWN = `# 欢迎使用 xEdit

一款 **Markdown 微信公众号排版工具**。左侧编辑，右侧实时预览，点击右上角「复制到公众号」即可粘贴进微信后台。

## 它能做什么

- 多套排版主题，代码高亮支持 Mac 风格窗口
- 外部链接自动转成文末[参考链接](https://github.com)
- 支持数学公式：$E = mc^2$
- 图片粘贴自动上传图床（需登录并配置阿里云 OSS）

> 登录 GitHub 账号后，文章自动保存到云端，多篇管理。

## 代码示例

\`\`\`javascript
function hello(name) {
  console.log(\`Hello, \${name}!\`);
}
hello("公众号");
\`\`\`

## 表格

| 功能 | 状态 |
| --- | --- |
| 公众号复制 | ✅ |
| 知乎复制 | ✅ |
| 云端同步 | ✅ |

$$
\\int_{-\\infty}^{+\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
$$
`;

interface SettingsSlice {
  themeId: string;
  codeThemeId: string;
  customCss: string;
  /** 可视化主题编辑器保存的「我的主题」，themeId 以 custom: 前缀引用 */
  customThemes: CustomThemeSpec[];
  macCode: boolean;
  linkFootnote: boolean;
  syncScroll: boolean;
  /** 源码模式：关闭编辑区的即时渲染，显示原始 Markdown（⌘/ 切换） */
  sourceMode: boolean;
  /** 编辑区占编辑+预览总宽的比例 */
  splitRatio: number;
  /** 排版微调：正文字号(px)/行高/段间距(px) */
  tuneFontSize: number;
  tuneLineHeight: number;
  tuneParaSpacing: number;
}

interface EditorState extends SettingsSlice {
  /** 当前文档；docId 为 null 表示未登录的本地文稿 */
  docId: string | null;
  title: string;
  content: string;
  /** 当前文档所属分类（云端文档有效） */
  category: string;
  saveState: SaveState;
  /** 由设置抽屉/弹窗使用 */
  cssDialogOpen: boolean;
  /** 主题编辑器：closed 未打开；"new" 新建；其余为在编辑的自定义主题 id */
  themeStudio: "closed" | "new" | string;
  /** 文本 AI（内容审查用）是否已配置密钥（服务端拉取，不持久化） */
  aiChatReady: boolean;

  setContent: (content: string) => void;
  setTitle: (title: string) => void;
  setDoc: (doc: { id: string | null; title: string; content: string }) => void;
  setSaveState: (s: SaveState) => void;
  setThemeId: (id: string) => void;
  setCodeThemeId: (id: string) => void;
  setCustomCss: (css: string) => void;
  setMacCode: (v: boolean) => void;
  setLinkFootnote: (v: boolean) => void;
  setSyncScroll: (v: boolean) => void;
  setSourceMode: (v: boolean) => void;
  setCssDialogOpen: (v: boolean) => void;
  setThemeStudio: (v: "closed" | "new" | string) => void;
  /** 保存（新建或覆盖）一个自定义主题 */
  saveCustomTheme: (spec: CustomThemeSpec) => void;
  removeCustomTheme: (id: string) => void;
  setCustomThemes: (list: CustomThemeSpec[]) => void;
  setSplitRatio: (r: number) => void;
  setTune: (t: { tuneFontSize?: number; tuneLineHeight?: number; tuneParaSpacing?: number }) => void;
  setCategory: (c: string) => void;
  setAiStatus: (s: { aiChatReady: boolean }) => void;
}

/** 防抖落盘的 persist 存储。middleware 每次 set 都会「全量 partialize → 序列化 → 同步写
 *  localStorage」，而正文也在持久化清单里，等于每敲一键就把整篇文章序列化写一次盘。
 *  这里攒 400ms 一起写，页面隐藏/关闭时强制冲刷；最坏丢最后 400ms 的击键，
 *  且本地文库镜像另有独立落盘，不依赖这一份。 */
let pendingWrite: unknown = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const flushWrite = () => {
  writeTimer = null;
  if (pendingWrite === null) return;
  try {
    localStorage.setItem("xedit-store", JSON.stringify(pendingWrite));
  } catch {
    // 私密模式 / 配额满：写不进就算了，内存态不受影响
  }
  pendingWrite = null;
};
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushWrite);
}

function debouncedStorage<S>(): PersistStorage<S> {
  return {
    getItem: (name) => {
      if (typeof window === "undefined") return null;
      try {
        const raw = localStorage.getItem(name);
        return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
      } catch {
        return null;
      }
    },
    setItem: (_name, value) => {
      pendingWrite = value;
      if (writeTimer === null) writeTimer = setTimeout(flushWrite, 400);
    },
    removeItem: (name) => {
      pendingWrite = null;
      if (typeof window !== "undefined") localStorage.removeItem(name);
    },
  };
}

export const useStore = create<EditorState>()(
  persist(
    (set) => ({
      themeId: "classic",
      codeThemeId: "vs2015",
      customCss: "",
      customThemes: [],
      macCode: true,
      linkFootnote: true,
      syncScroll: true,
      sourceMode: false,
      splitRatio: 0.5,
      tuneFontSize: 16,
      tuneLineHeight: 1.75,
      tuneParaSpacing: 16,

      docId: null,
      title: "未命名文章",
      content: DEFAULT_MARKDOWN,
      category: "未分类",
      saveState: "local",
      cssDialogOpen: false,
      themeStudio: "closed" as const,
      aiChatReady: false,

      setContent: (content) => set({ content }),
      setTitle: (title) => set({ title }),
      setDoc: (doc) => set({ docId: doc.id, title: doc.title, content: doc.content }),
      setSaveState: (saveState) => set({ saveState }),
      setThemeId: (themeId) => set({ themeId }),
      setCodeThemeId: (codeThemeId) => set({ codeThemeId }),
      setCustomCss: (customCss) => set({ customCss }),
      setMacCode: (macCode) => set({ macCode }),
      setLinkFootnote: (linkFootnote) => set({ linkFootnote }),
      setSyncScroll: (syncScroll) => set({ syncScroll }),
      setSourceMode: (sourceMode) => set({ sourceMode }),
      setCssDialogOpen: (cssDialogOpen) => set({ cssDialogOpen }),
      setThemeStudio: (themeStudio) => set({ themeStudio }),
      saveCustomTheme: (spec) =>
        set((s) => ({
          customThemes: s.customThemes.some((t) => t.id === spec.id)
            ? s.customThemes.map((t) => (t.id === spec.id ? spec : t))
            : [...s.customThemes, spec],
        })),
      removeCustomTheme: (id) =>
        set((s) => ({
          customThemes: s.customThemes.filter((t) => t.id !== id),
          // 正在使用被删主题时回落到默认
          themeId: s.themeId === `custom:${id}` ? "classic" : s.themeId,
        })),
      setCustomThemes: (customThemes) => set({ customThemes }),
      setSplitRatio: (splitRatio) =>
        set({ splitRatio: Math.min(0.75, Math.max(0.25, splitRatio)) }),
      setTune: (t) => set(t),
      setCategory: (category) => set({ category }),
      setAiStatus: (s) => set(s),
    }),
    {
      name: "xedit-store",
      version: 4,
      storage: debouncedStorage(),
      // v1 起代码主题固定 VS 2015、Mac 风格固定开启；v2 起移除手机预览模式，清掉历史持久化值；
      // v3 起专注模式下线：即时渲染并入首页文章视图，编辑页固定分屏；
      // v4 起 AI 密钥改为服务端按账号加密存储，清掉本地遗留的接口地址/密钥/模型；
      // v4 同版补充：AI 写作/生图下线，清掉本地记住的临时模型选择
      migrate: (persisted) => {
        const state = persisted as Record<string, unknown> | undefined;
        if (state) {
          delete state.codeThemeId;
          delete state.macCode;
          delete state.previewMode;
          delete state.focusMode;
          delete state.aiBaseUrl;
          delete state.aiApiKey;
          delete state.aiModel;
          delete state.aiImageModel;
          delete state.aiChatChoice;
        }
        return state as never;
      },
      partialize: (state) => ({
        themeId: state.themeId,
        customCss: state.customCss,
        customThemes: state.customThemes,
        linkFootnote: state.linkFootnote,
        syncScroll: state.syncScroll,
        sourceMode: state.sourceMode,
        splitRatio: state.splitRatio,
        tuneFontSize: state.tuneFontSize,
        tuneLineHeight: state.tuneLineHeight,
        tuneParaSpacing: state.tuneParaSpacing,
        // 未登录时的本地文稿也持久化，防止刷新丢失
        title: state.title,
        content: state.content,
      }),
    }
  )
);
