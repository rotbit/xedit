import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import type { CustomThemeSpec } from "@/lib/themes/custom";
import { DEFAULT_MARKDOWN } from "@/lib/welcomeDoc";
import { DEFAULT_TUNE, type TuneValues } from "@/lib/themes/tune";
import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";

/** pending: saved to the local mirror, waiting to sync to the cloud once online */
export type SaveState = "local" | "saving" | "saved" | "pending" | "error" | "local-error";

export { DEFAULT_MARKDOWN } from "@/lib/welcomeDoc";

interface SettingsSlice {
  themeId: string;
  /** Fixed constant, no setter: since v1 the code theme is locked to VS 2015 and no longer persisted (see migrate below) */
  readonly codeThemeId: string;
  customCss: string;
  /** "My themes" saved by the visual theme editor; themeId references them with a custom: prefix */
  customThemes: CustomThemeSpec[];
  /** Same as above: Mac-style code blocks are always on, typed read-only so another unused setter doesn't sprout */
  readonly macCode: boolean;
  linkFootnote: boolean;
  syncScroll: boolean;
  /** Source mode: turn off live rendering in the editor and show raw Markdown (⌘/ toggles) */
  sourceMode: boolean;
  /** Editor's share of the combined editor + preview width */
  splitRatio: number;
  /** Typography tuning: body font size (px) / line height / paragraph spacing (px) */
  tuneFontSize: number;
  tuneLineHeight: number;
  tuneParaSpacing: number;
}

interface EditorState extends SettingsSlice {
  /** Current document; docId null means a signed-out local draft */
  docId: string | null;
  title: string;
  content: string;
  /** Category of the current document (cloud documents only) */
  category: string;
  saveState: SaveState;
  /** Used by the settings drawer/dialog */
  cssDialogOpen: boolean;
  /** Theme editor: closed when not open; "new" when creating; otherwise the id of the custom theme being edited */
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
  /** Save (create or overwrite) a custom theme */
  saveCustomTheme: (spec: CustomThemeSpec) => void;
  removeCustomTheme: (id: string) => void;
  setCustomThemes: (list: CustomThemeSpec[]) => void;
  setSplitRatio: (r: number) => void;
  setTune: (t: Partial<TuneValues>) => void;
  setCategory: (c: string) => void;
}

/** Settings live under this key (managed by persist) */
const SETTINGS_KEY = "xedit-store";
/** The draft (signed-out local draft) gets its own key: it used to share SETTINGS_KEY with settings,
 *  so changing the font size re-serialized and rewrote the whole body to disk, and bodies often run tens of thousands of characters. */
const DOC_KEY = "xedit-store-doc";

/** Draft fields stored under DOC_KEY */
interface DocDraft {
  title: string;
  content: string;
}

/** Debounced persistence. persist does "partialize → serialize → synchronous localStorage write" on every set;
 *  here writes are batched per key for 400ms and flushed when the page is hidden/closed. Worst case loses the last 400ms of keystrokes,
 *  and the local library mirror persists independently, not relying on this copy. */
const pending = new Map<string, unknown>();
/** The last string actually written. When settings haven't changed but the body is, persist keeps handing over the same settings;
 *  if the value is identical, skip the synchronous write. */
const lastWritten = new Map<string, string>();
let writeTimer: ReturnType<typeof setTimeout> | null = null;

/** Write one key; if it fails, give up (private mode / quota full). In-memory state is unaffected, and one key failing doesn't affect the other */
function writeNow(key: string, value: unknown): void {
  try {
    const text = JSON.stringify(value);
    if (lastWritten.get(key) === text) return;
    localStorage.setItem(key, text);
    lastWritten.set(key, text);
  } catch {
    // Swallow: a failed write shouldn't crash the page
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
 * Read the local draft once at startup. If DOC_KEY is missing (older users), look in SETTINGS_KEY —
 * the body used to be stored with settings — and move it to the new key on the spot:
 * otherwise if the user only changes a setting without typing a word, that key is rewritten without the body and the draft is gone.
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
      // The draft is read back from DOC_KEY (older users migrated from SETTINGS_KEY); persist only handles settings
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
          // Fall back to the default if the theme in use was deleted
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
      // Since v1 the code theme is fixed to VS 2015 and Mac style is always on; v2 removed the mobile preview mode, clearing persisted values;
      // v3 retired focus mode: live rendering moved into the home article view, and the edit page is always split;
      // v4 moved AI keys to server-side per-account encrypted storage, clearing the leftover local endpoint/key/model;
      // v4 addendum: AI writing/image generation retired, clearing the locally remembered temporary model choice;
      // v5 moved the draft (title/content) to its own DOC_KEY, so the old copy is cleared here —
      // the in-memory copy was already read from the old key by bootDocDraft; this only clears the duplicate
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
      // The draft only comes from DOC_KEY: even if the settings copy still has title/content (written by an old version,
      // or a hand-edited localStorage), it must not overwrite the draft just read from the draft key
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

// The signed-out local draft must persist too (so a refresh doesn't lose it), but under its own key:
// settings changes needn't carry the body, and typing needn't rewrite the settings.
if (typeof window !== "undefined") {
  useStore.subscribe((s, prev) => {
    if (s.title === prev.title && s.content === prev.content) return;
    scheduleWrite(DOC_KEY, { title: s.title, content: s.content } satisfies DocDraft);
  });
}
