import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SaveState = "local" | "saving" | "saved" | "error";

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
  macCode: boolean;
  linkFootnote: boolean;
  syncScroll: boolean;
  /** 编辑区占编辑+预览总宽的比例 */
  splitRatio: number;
  /** 专注模式：收起预览，正文居中限宽 */
  focusMode: boolean;
  /** 排版微调：正文字号(px)/行高/段间距(px) */
  tuneFontSize: number;
  tuneLineHeight: number;
  tuneParaSpacing: number;
  /** OpenAI 兼容接口地址，如 https://api.deepseek.com/v1 */
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  aiImageModel: string;
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
  setCssDialogOpen: (v: boolean) => void;
  setSplitRatio: (r: number) => void;
  setFocusMode: (v: boolean) => void;
  setTune: (t: { tuneFontSize?: number; tuneLineHeight?: number; tuneParaSpacing?: number }) => void;
  setCategory: (c: string) => void;
  setAiConfig: (c: {
    aiBaseUrl?: string;
    aiApiKey?: string;
    aiModel?: string;
    aiImageModel?: string;
  }) => void;
}

export const useStore = create<EditorState>()(
  persist(
    (set) => ({
      themeId: "classic",
      codeThemeId: "vs2015",
      customCss: "",
      macCode: true,
      linkFootnote: true,
      syncScroll: true,
      splitRatio: 0.5,
      focusMode: false,
      tuneFontSize: 16,
      tuneLineHeight: 1.75,
      tuneParaSpacing: 16,
      aiBaseUrl: "https://api.openai.com/v1",
      aiApiKey: "",
      aiModel: "gpt-4o-mini",
      aiImageModel: "gpt-image-1",

      docId: null,
      title: "未命名文章",
      content: DEFAULT_MARKDOWN,
      category: "未分类",
      saveState: "local",
      cssDialogOpen: false,

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
      setCssDialogOpen: (cssDialogOpen) => set({ cssDialogOpen }),
      setSplitRatio: (splitRatio) =>
        set({ splitRatio: Math.min(0.75, Math.max(0.25, splitRatio)) }),
      setFocusMode: (focusMode) => set({ focusMode }),
      setTune: (t) => set(t),
      setCategory: (category) => set({ category }),
      setAiConfig: (c) => set(c),
    }),
    {
      name: "xedit-store",
      version: 2,
      // v1 起代码主题固定 VS 2015、Mac 风格固定开启；v2 起移除手机预览模式，清掉历史持久化值
      migrate: (persisted) => {
        const state = persisted as Record<string, unknown> | undefined;
        if (state) {
          delete state.codeThemeId;
          delete state.macCode;
          delete state.previewMode;
        }
        return state as never;
      },
      partialize: (state) => ({
        themeId: state.themeId,
        customCss: state.customCss,
        linkFootnote: state.linkFootnote,
        syncScroll: state.syncScroll,
        splitRatio: state.splitRatio,
        focusMode: state.focusMode,
        tuneFontSize: state.tuneFontSize,
        tuneLineHeight: state.tuneLineHeight,
        tuneParaSpacing: state.tuneParaSpacing,
        aiBaseUrl: state.aiBaseUrl,
        aiApiKey: state.aiApiKey,
        aiModel: state.aiModel,
        aiImageModel: state.aiImageModel,
        // 未登录时的本地文稿也持久化，防止刷新丢失
        title: state.title,
        content: state.content,
      }),
    }
  )
);
