import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import type { CustomThemeSpec } from "@/lib/themes/custom";
import { DEFAULT_MARKDOWN } from "@/lib/welcomeDoc";
import { DEFAULT_TUNE, type TuneValues } from "@/lib/themes/tune";
import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";

/** pending：已存本地镜像、等待联网后同步云端 */
export type SaveState = "local" | "saving" | "saved" | "pending" | "error" | "local-error";

export { DEFAULT_MARKDOWN } from "@/lib/welcomeDoc";

interface SettingsSlice {
  themeId: string;
  /** 固定常量，无 setter：v1 起代码主题锁定 VS 2015，也不再持久化（见下方 migrate） */
  readonly codeThemeId: string;
  customCss: string;
  /** 可视化主题编辑器保存的「我的主题」，themeId 以 custom: 前缀引用 */
  customThemes: CustomThemeSpec[];
  /** 同上：Mac 风格代码块固定开启，类型上标只读，免得再长出一个无人调用的 setter */
  readonly macCode: boolean;
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

  setContent: (content: string) => void;
  setTitle: (title: string) => void;
  setDoc: (doc: { id: string | null; title: string; content: string }) => void;
  setSaveState: (s: SaveState) => void;
  setThemeId: (id: string) => void;
  setCustomCss: (css: string) => void;
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
  setTune: (t: Partial<TuneValues>) => void;
  setCategory: (c: string) => void;
}

/** 设置项落在这个键下（persist 自己管） */
const SETTINGS_KEY = "xedit-store";
/** 文稿（未登录时的本地草稿）单独一个键：以前它和设置挤在 SETTINGS_KEY 里，
 *  改一次字号就要把整篇正文重新序列化写一遍盘，而正文动辄几万字。 */
const DOC_KEY = "xedit-store-doc";

/** 落在 DOC_KEY 下的文稿字段 */
interface DocDraft {
  title: string;
  content: string;
}

/** 防抖落盘。persist 每次 set 都会「partialize → 序列化 → 同步写 localStorage」，
 *  这里按键攒 400ms 一起写，页面隐藏/关闭时强制冲刷；最坏丢最后 400ms 的击键，
 *  且本地文库镜像另有独立落盘，不依赖这一份。 */
const pending = new Map<string, unknown>();
/** 上一次真正写进去的字符串。设置没动而正文在变时，persist 仍会把同一份设置反复递过来，
 *  值一样就不必再占一次同步写。 */
const lastWritten = new Map<string, string>();
let writeTimer: ReturnType<typeof setTimeout> | null = null;

/** 写一个键；写不进就算了（私密模式 / 配额满），内存态不受影响，一个键失败不牵连另一个 */
function writeNow(key: string, value: unknown): void {
  try {
    const text = JSON.stringify(value);
    if (lastWritten.get(key) === text) return;
    localStorage.setItem(key, text);
    lastWritten.set(key, text);
  } catch {
    // 吞掉：落盘失败不该把页面带崩
  }
}

const flushWrite = () => {
  if (writeTimer !== null) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  for (const [key, value] of pending) writeNow(key, value);
  pending.clear();
};

const scheduleWrite = (key: string, value: unknown) => {
  pending.set(key, value);
  if (writeTimer === null) writeTimer = setTimeout(flushWrite, 400);
};

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushWrite);
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * 开机读一次本地文稿。DOC_KEY 不在（老用户）就去 SETTINGS_KEY 里捞——
 * 正文以前是和设置存在一起的——捞到当场搬到新键下：
 * 否则用户只改了个设置、一个字没敲，那边被重写成不含正文的版本，草稿就没了。
 */
function bootDocDraft(): DocDraft | null {
  if (typeof window === "undefined") return null;
  const own = readJson(DOC_KEY) as Partial<DocDraft> | null;
  if (own && typeof own.content === "string") {
    return {
      title: typeof own.title === "string" ? own.title : UNTITLED_DOC,
      content: own.content,
    };
  }
  const legacy = (readJson(SETTINGS_KEY) as { state?: Partial<DocDraft> } | null)?.state;
  if (legacy && typeof legacy.content === "string") {
    const draft: DocDraft = {
      title: typeof legacy.title === "string" ? legacy.title : UNTITLED_DOC,
      content: legacy.content,
    };
    writeNow(DOC_KEY, draft);
    return draft;
  }
  return null;
}

const bootDraft = bootDocDraft();

function debouncedStorage<S>(): PersistStorage<S> {
  return {
    getItem: (name) => {
      if (typeof window === "undefined") return null;
      return (readJson(name) as StorageValue<S> | null) ?? null;
    },
    setItem: (name, value) => {
      scheduleWrite(name, value);
    },
    removeItem: (name) => {
      pending.delete(name);
      lastWritten.delete(name);
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
      ...DEFAULT_TUNE,

      docId: null,
      // 文稿从 DOC_KEY 回读（老用户从 SETTINGS_KEY 搬过来），persist 只管设置
      title: bootDraft?.title ?? UNTITLED_DOC,
      content: bootDraft?.content ?? DEFAULT_MARKDOWN,
      category: UNCATEGORIZED,
      saveState: "local",
      cssDialogOpen: false,
      themeStudio: "closed" as const,

      setContent: (content) => set({ content }),
      setTitle: (title) => set({ title }),
      setDoc: (doc) => set({ docId: doc.id, title: doc.title, content: doc.content }),
      setSaveState: (saveState) => set({ saveState }),
      setThemeId: (themeId) => set({ themeId }),
      setCustomCss: (customCss) => set({ customCss }),
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
    }),
    {
      name: SETTINGS_KEY,
      version: 5,
      storage: debouncedStorage(),
      // v1 起代码主题固定 VS 2015、Mac 风格固定开启；v2 起移除手机预览模式，清掉历史持久化值；
      // v3 起专注模式下线：即时渲染并入首页文章视图，编辑页固定分屏；
      // v4 起 AI 密钥改为服务端按账号加密存储，清掉本地遗留的接口地址/密钥/模型；
      // v4 同版补充：AI 写作/生图下线，清掉本地记住的临时模型选择；
      // v5 起文稿（title/content）搬去 DOC_KEY 单独存，这里清掉老副本——
      // 内存里的那一份已由 bootDocDraft 从老键读出来了，清的只是重复的一份
      migrate: (persisted) => {
        const state = persisted as Record<string, unknown> | undefined;
        if (state) {
          delete state.title;
          delete state.content;
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
      // 文稿只认 DOC_KEY 一个出处：设置那份里万一还留着 title/content（老版本写的、
      // 或手改过的 localStorage），也不许它盖掉刚从文稿键读出来的草稿
      merge: (persisted, current) => {
        const state = { ...(persisted as Record<string, unknown> | null) };
        delete state.title;
        delete state.content;
        return { ...current, ...state };
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
      }),
    }
  )
);

// 未登录时的本地文稿也要持久化（防止刷新丢失），但它自己一个键：
// 设置变来变去不必带上正文，敲字也不必把设置重写一遍。
if (typeof window !== "undefined") {
  useStore.subscribe((s, prev) => {
    if (s.title === prev.title && s.content === prev.content) return;
    scheduleWrite(DOC_KEY, { title: s.title, content: s.content } satisfies DocDraft);
  });
}
