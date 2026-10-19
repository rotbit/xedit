// State layer for the Notion-style `/` slash menu: detection, StateField, keymap, item table and filtering.
//
// Why all the state lives in CodeMirror rather than React:
// 1) The menu's open/closed state is fully determined by the document and cursor; in a StateField it evolves with transactions,
//    so undo/redo, collaborative changes and programmatic dispatch all come out right with no extra syncing;
// 2) Keys must be intercepted at the CodeMirror layer with a Prec.highest keymap: DOM-level keydown
//    listeners can't reliably beat defaultKeymap (Enter newline, Tab indent, Escape collapse selection),
//    and a keymap's run consumes on true and passes through on false, exactly the semantics needed here;
// 3) React only subscribes for rendering and holds no truth, so typing doesn't re-render the article view.

import { Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Lightbulb,
  SquareCode,
  Table,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Image as ImageIcon,
  Film,
  Link as LinkIcon,
  Bold,
  type LucideIcon,
} from "lucide-react";
import { caretInFencedCode } from "@/lib/livePreview/context";
import { runFormatCommand, type FormatCommand, type Notify } from "@/lib/editor/commands";
import { prefixLines } from "@/lib/editor/format";
import { tk } from "@/i18n/t";

export interface SlashItem {
  /** Unique id, also the React list key; uses the command name when there's a matching command */
  id: string;
  /** Chinese source text (marked with tk), rendered as t(item.label) */
  label: string;
  /** Gray text on the right: the matching Markdown syntax, which also teaches users the source form */
  hint: string;
  icon: LucideIcon;
  /** Full Chinese name / full pinyin / pinyin initials / English / markdown syntax, hand-written without a pinyin library */
  keywords: string[];
  /**
   * Run the action. Most items hand off to the command layer, the same entry as the toolbar and shortcuts;
   * ordered/unordered lists have no command-layer entry (the toolbar doesn't have them either), and rather than opening a hole in FormatCommand
   * just for the menu, prefixLines is called directly; it's a toggle itself, so pressing again reverts to a plain paragraph.
   */
  run: (view: EditorView, notify: Notify) => void;
}

/** Items routed through the command layer: formatting is defined only there, not duplicated here */
const byCommand =
  (cmd: FormatCommand) => (view: EditorView, notify: Notify) =>
    runFormatCommand(view, cmd, notify);

/** Fixed order: three heading levels → quote → callout → code block → table → three list types → divider
 *  → image → video → inline link and bold (inline formats last, block-level ones show first) */
export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "h1",
    label: tk("一级标题"),
    hint: "#",
    icon: Heading1,
    keywords: ["一级标题", "yijibiaoti", "yjbt", "h1", "heading", "heading1", "title", "#"], // i18n-ignore search keywords (full Chinese name), independent of UI language
    run: byCommand("h1"),
  },
  {
    id: "h2",
    label: tk("二级标题"),
    hint: "##",
    icon: Heading2,
    keywords: ["二级标题", "erjibiaoti", "ejbt", "h2", "heading", "heading2", "title", "##"], // i18n-ignore search keywords (full Chinese name), independent of UI language
    run: byCommand("h2"),
  },
  {
    id: "h3",
    label: tk("三级标题"),
    hint: "###",
    icon: Heading3,
    keywords: ["三级标题", "sanjibiaoti", "sjbt", "h3", "heading", "heading3", "title", "###"], // i18n-ignore search keywords (full Chinese name), independent of UI language
    run: byCommand("h3"),
  },
  {
    id: "quote",
    label: tk("引用"),
    hint: ">",
    icon: Quote,
    keywords: ["引用", "yinyong", "yy", "quote", "blockquote", ">"], // i18n-ignore search keywords (full Chinese name), independent of UI language
    run: byCommand("quote"),
  },
  {
    id: "callout",
    label: tk("提示块"),
    hint: "> [!tip]",
    icon: Lightbulb,
    keywords: [
      "提示块", // i18n-ignore search keywords (full Chinese name), independent of UI language
      "tishikuai",
      "tsk",
      "callout",
      "admonition",
      "tip",
      "note",
      "warning",
      "[!",
    ],
    run: byCommand("callout"),
  },
  {
    id: "codeblock",
    label: tk("代码块"),
    hint: "```",
    icon: SquareCode,
    keywords: ["代码块", "daimakuai", "dmk", "code", "codeblock", "```"], // i18n-ignore search keywords (full Chinese name), independent of UI language
    run: byCommand("codeblock"),
  },
  {
    id: "table",
    label: tk("表格"),
    hint: "|",
    icon: Table,
    keywords: ["表格", "biaoge", "bg", "table", "grid", "|"], // i18n-ignore search keywords (full Chinese name), independent of UI language
    run: byCommand("table"),
  },
  {
    id: "ul",
    label: tk("无序列表"),
    hint: "-",
    icon: List,
    keywords: [
      "无序列表", // i18n-ignore search keywords (full Chinese name), independent of UI language
      "wuxuliebiao",
      "wxlb",
      "列表", // i18n-ignore search keywords (full Chinese name), independent of UI language
      "liebiao",
      "lb",
      "list",
      "ul",
      "bullet",
      "unordered",
      "- ",
    ],
    run: (view) => prefixLines(view, "- "),
  },
  {
    id: "ol",
    label: tk("有序列表"),
    hint: "1.",
    icon: ListOrdered,
    keywords: [
      "有序列表", // i18n-ignore search keywords (full Chinese name), independent of UI language
      "youxuliebiao",
      "yxlb",
      "列表", // i18n-ignore search keywords (full Chinese name), independent of UI language
      "liebiao",
      "lb",
      "list",
      "ol",
      "number",
      "ordered",
      "1. ",
    ],
    // Only insert "1. " on the first line; numbering of continuation lines is left to the editor's list key handling
    run: (view) => prefixLines(view, "1. "),
  },
  {
    id: "tasklist",
    label: tk("任务列表"),
    hint: "- [ ]",
    icon: ListTodo,
    keywords: ["任务列表", "renwuliebiao", "rwlb", "task", "tasklist", "todo", "checkbox", "- [ ]"], // i18n-ignore search keywords (full Chinese name), independent of UI language
    run: byCommand("tasklist"),
  },
  {
    id: "hr",
    label: tk("分割线"),
    hint: "---",
    icon: Minus,
    keywords: ["分割线", "fengexian", "fgx", "hr", "divider", "rule", "---"], // i18n-ignore search keywords (full Chinese name), independent of UI language
    run: byCommand("hr"),
  },
  {
    id: "image",
    label: tk("图片"),
    hint: "![]()",
    icon: ImageIcon,
    keywords: ["图片", "tupian", "tp", "image", "img", "picture", "photo", "!["], // i18n-ignore search keywords (full Chinese name), independent of UI language
    run: byCommand("image"),
  },
  {
    id: "video",
    label: tk("视频（上传）"),
    hint: tk("上传"),
    icon: Film,
    keywords: ["视频", "shipin", "sp", "video", "movie", "mp4", "upload"], // i18n-ignore search keywords (full Chinese name), independent of UI language
    run: byCommand("video"),
  },
  {
    id: "link",
    label: tk("链接"),
    hint: "[]()",
    icon: LinkIcon,
    keywords: ["链接", "lianjie", "lj", "超链接", "link", "url", "href", "[]("], // i18n-ignore search keywords (full Chinese name), independent of UI language
    run: byCommand("link"),
  },
  {
    id: "bold",
    label: tk("加粗"),
    hint: "**",
    icon: Bold,
    keywords: ["加粗", "jiacu", "jc", "粗体", "cuti", "ct", "bold", "strong", "**"], // i18n-ignore search keywords (full Chinese name), independent of UI language
    run: byCommand("bold"),
  },
];

/** Prefix matches first, then substring: prefix hits rank first, the rest keep the original table order stably */
export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  const prefix: SlashItem[] = [];
  const contains: SlashItem[] = [];
  for (const item of SLASH_ITEMS) {
    const hay = [item.label, ...item.keywords].map((s) => s.toLowerCase());
    if (hay.some((s) => s.startsWith(q))) prefix.push(item);
    else if (hay.some((s) => s.includes(q))) contains.push(item);
  }
  return [...prefix, ...contains];
}

export interface SlashState {
  /** Position of the `/` itself */
  from: number;
  /** Filter text between `/` and the cursor */
  query: string;
  /** Index of the highlighted item within the filtered results */
  index: number;
}

interface SlashFieldValue {
  open: SlashState | null;
  /** Position of the `/` dismissed with Esc: don't auto-reopen while the cursor is still right after it */
  dismissed: number | null;
}

const EMPTY: SlashFieldValue = { open: null, dismissed: null };

/**
 * Trigger condition: the char before `/` is line start, whitespace, or a CJK character / full-width Chinese punctuation.
 *
 * The old whitespace-only rule is basically useless in Chinese: Chinese prose has no spaces, so 「今天/」 could never open the menu,
 * and users had to type a space then delete it. The widened range is strictly "outside half-width ASCII":
 * letters, digits, `:` and `/` still don't trigger, so `http://`, `src/lib`, `1/2`, `2026/09/17`
 * are unaffected. Full-width digits and letters are excluded too (０-９, Ａ-Ｚ,
 * ａ-ｚ aren't in the ranges below), so something like 「２０２６／」 isn't mistaken for a trigger.
 *
 * Covers: CJK punctuation and the ideographic space (　-〿, ，。、「」『』《》【】〔〕…),
 * Japanese kana (぀-ヿ), CJK ideographs and Extension A (一-鿿, 㐀-䶿),
 * curly quotes and ellipsis (‘-”, …), full-width punctuation (！-／, ：-＠,
 * ［-｀, ｛-･, including ！？：；，）］｝～｣).
 */
const BEFORE_SLASH =
  "\\s\\u2018-\\u201d\\u2026\\u3000-\\u303f\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff" +
  "\\uff01-\\uff0f\\uff1a-\\uff20\\uff3b-\\uff40\\uff5b-\\uff65";
const TRIGGER = new RegExp(`(^|[${BEFORE_SLASH}])/([^\\s/]*)$`);

function detectSlash(state: EditorState): { from: number; query: string } | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  if (caretInFencedCode(state)) return null;
  const line = state.doc.lineAt(sel.head);
  const before = line.text.slice(0, sel.head - line.from);
  const m = before.match(TRIGGER);
  if (!m) return null;
  const query = m[2];
  return { from: sel.head - query.length - 1, query };
}

/** Close the menu. value=true means "remember this `/`" (dismissed with Esc, don't pop right back) */
const closeSlash = StateEffect.define<boolean>();
/** Move the highlighted item: keyboard and mouse share one index, so only the state layer can decide */
const setSlashIndex = StateEffect.define<number>();

const slashField = StateField.define<SlashFieldValue>({
  create: () => EMPTY,
  update(prev, tr) {
    // dismissed stores an absolute document offset: inserting/deleting text before it makes the position drift,
    // and without mapping it the `/` dismissed with Esc goes unrecognized: the menu pops right back,
    // or conversely another `/` is mistaken for the dismissed one.
    // Keep the same object reference when !docChanged so React's "no change, no re-render" holds.
    const value =
      tr.docChanged && prev.dismissed !== null
        ? { ...prev, dismissed: tr.changes.mapPos(prev.dismissed, -1) }
        : prev;
    for (const e of tr.effects) {
      if (e.is(closeSlash)) {
        return { open: null, dismissed: e.value ? (value.open?.from ?? null) : null };
      }
      if (e.is(setSlashIndex) && value.open) {
        return { ...value, open: { ...value.open, index: e.value } };
      }
    }
    // If neither document nor cursor moved, keep the original value (same object), so React knows no re-render is needed
    if (!tr.docChanged && !tr.selection) return value;
    const next = detectSlash(tr.state);
    // `/` is no longer before the cursor (deleted, moved away, space typed): clear the Esc memory too so it can trigger normally next time
    if (!next) return EMPTY;
    if (next.from === value.dismissed) return { open: null, dismissed: value.dismissed };
    const items = filterSlashItems(next.query);
    // The filter matches nothing anymore (e.g. a link was pasted right after `/`): close it,
    // rather than leaving a "no matching blocks" panel cluttering the body
    if (!items.length) return { open: null, dismissed: null };
    // Keep the highlight only for the same `/` with unchanged filter text; any filter change resets to the first item
    const keep =
      value.open && value.open.from === next.from && value.open.query === next.query
        ? value.open.index
        : 0;
    // The !items.length case returned early above, so items is non-empty here; just clamp
    return {
      open: { ...next, index: Math.min(keep, items.length - 1) },
      dismissed: null,
    };
  },
});

export function slashStateOf(state: EditorState): SlashState | null {
  return state.field(slashField, false)?.open ?? null;
}

/** Select an item: first delete `/query` in one change, then run the command.
 *  Two separate changes are necessary: insertBlock / prefixLines both read the current line "after deletion";
 *  triggered at line start the line is then empty so no extra blank line is added, while mid-line a new paragraph starts */
export function runSlashItem(
  view: EditorView,
  item: SlashItem,
  from: number,
  to: number,
  notify: Notify
) {
  view.dispatch({ changes: { from, to, insert: "" }, selection: { anchor: from } });
  item.run(view, notify);
  view.focus();
}

function pickCurrent(view: EditorView, notify: Notify): boolean {
  const st = slashStateOf(view.state);
  if (!st) return false;
  const items = filterSlashItems(st.query);
  // With no matches don't consume Enter/Tab; hand them back to CodeMirror to newline or indent as usual
  const item = items[st.index];
  if (!item) return false;
  runSlashItem(view, item, st.from, st.from + 1 + st.query.length, notify);
  return true;
}

function moveHighlight(view: EditorView, delta: number): boolean {
  const st = slashStateOf(view.state);
  if (!st) return false;
  const n = filterSlashItems(st.query).length;
  // With no matches there's no row to highlight, so let ↑↓ through to the editor: the cursor leaves the line and the menu closes naturally
  if (!n) return false;
  view.dispatch({ effects: setSlashIndex.of((st.index + delta + n) % n) });
  return true;
}

/** Consume keys only while the menu is open, otherwise always return false to pass through; ⌘B/⌘I/⌘K, Enter, Tab are unaffected */
const slashKeymap = (notify: Notify) =>
  Prec.highest(
    keymap.of([
      { key: "ArrowDown", run: (v) => moveHighlight(v, 1) },
      { key: "ArrowUp", run: (v) => moveHighlight(v, -1) },
      { key: "Enter", run: (v) => pickCurrent(v, notify) },
      { key: "Tab", run: (v) => pickCurrent(v, notify) },
      {
        key: "Escape",
        run: (v) => {
          if (!slashStateOf(v.state)) return false;
          v.dispatch({ effects: closeSlash.of(true) });
          return true;
        },
      },
    ])
  );

/** Mouse hover highlight: called from React so keyboard and mouse share one index */
export function highlightSlashIndex(view: EditorView, index: number) {
  view.dispatch({ effects: setSlashIndex.of(index) });
}

/**
 * Assemble the extension. onState is called only when the menu state actually changes (including null on close),
 * and MarkdownEditor forwards it to <SlashMenu>, avoiding props that would re-render the whole article view.
 * notify: `/视频` (video) triggers an upload, and the caller shows the notice (lib doesn't import components).
 */
export function slashMenu({
  onState,
  notify,
}: {
  onState: (s: SlashState | null) => void;
  notify: Notify;
}): Extension {
  return [
    slashField,
    slashKeymap(notify),
    EditorView.updateListener.of((update) => {
      const prev = update.startState.field(slashField).open;
      const next = update.state.field(slashField).open;
      if (prev !== next) onState(next);
    }),
    EditorView.domEventHandlers({
      // Close on blur: a menu left hanging after clicking elsewhere is pure distraction.
      // The menu's own onMouseDown calls preventDefault, so clicking the menu never gets here
      blur: (_e, view) => {
        if (slashStateOf(view.state)) view.dispatch({ effects: closeSlash.of(false) });
        return false;
      },
    }),
  ];
}
