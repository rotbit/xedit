// Notion 式 `/` 斜杠菜单的状态层：检测、StateField、keymap、项目表与过滤。
//
// 为什么整套状态放 CodeMirror 而不是 React：
// 1) 菜单的开合完全由文档与光标决定，放进 StateField 就能随事务一起演进，
//    撤销/重做、协同变更、程序化 dispatch 都自动得到正确结果，不用另写同步；
// 2) 按键必须在 CodeMirror 层用 Prec.highest 的 keymap 拦截 —— DOM 层的 keydown
//    监听没法可靠地抢在 defaultKeymap（Enter 换行、Tab 缩进、Escape 收选区）之前，
//    而 keymap 的 run 返回 true 才消费、false 就原样放行，正是这里要的语义；
// 3) React 侧只订阅渲染，不持有真相，打字时不会触发文章视图的重渲染。

import { Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  Heading1,
  Heading2,
  Heading3,
  Quote,
  SquareCode,
  Table,
  ListTodo,
  Minus,
  Image as ImageIcon,
  Film,
  type LucideIcon,
} from "lucide-react";
import { caretInFencedCode } from "@/lib/livePreviewContext";
import { runFormatCommand, type FormatCommand } from "@/lib/editorCommands";

export interface SlashItem {
  cmd: FormatCommand;
  label: string;
  /** 右侧灰字：对应的 Markdown 记号，顺带教会用户源码写法 */
  hint: string;
  icon: LucideIcon;
  /** 中文全称 / 拼音全拼 / 拼音首字母 / 英文 / markdown 记号，手写不引拼音库 */
  keywords: string[];
}

/** 顺序固定：标题三档 → 引用 → 代码块 → 表格 → 任务列表 → 分割线 → 图片 → 视频 */
export const SLASH_ITEMS: SlashItem[] = [
  {
    cmd: "h1",
    label: "一级标题",
    hint: "#",
    icon: Heading1,
    keywords: ["一级标题", "yijibiaoti", "yjbt", "h1", "heading", "heading1", "title", "#"],
  },
  {
    cmd: "h2",
    label: "二级标题",
    hint: "##",
    icon: Heading2,
    keywords: ["二级标题", "erjibiaoti", "ejbt", "h2", "heading", "heading2", "title", "##"],
  },
  {
    cmd: "h3",
    label: "三级标题",
    hint: "###",
    icon: Heading3,
    keywords: ["三级标题", "sanjibiaoti", "sjbt", "h3", "heading", "heading3", "title", "###"],
  },
  {
    cmd: "quote",
    label: "引用",
    hint: ">",
    icon: Quote,
    keywords: ["引用", "yinyong", "yy", "quote", "blockquote", ">"],
  },
  {
    cmd: "codeblock",
    label: "代码块",
    hint: "```",
    icon: SquareCode,
    keywords: ["代码块", "daimakuai", "dmk", "code", "codeblock", "```"],
  },
  {
    cmd: "table",
    label: "表格",
    hint: "|",
    icon: Table,
    keywords: ["表格", "biaoge", "bg", "table", "grid", "|"],
  },
  {
    cmd: "tasklist",
    label: "任务列表",
    hint: "- [ ]",
    icon: ListTodo,
    keywords: ["任务列表", "renwuliebiao", "rwlb", "task", "tasklist", "todo", "checkbox", "- [ ]"],
  },
  {
    cmd: "hr",
    label: "分割线",
    hint: "---",
    icon: Minus,
    keywords: ["分割线", "fengexian", "fgx", "hr", "divider", "rule", "---"],
  },
  {
    cmd: "image",
    label: "图片",
    hint: "![]()",
    icon: ImageIcon,
    keywords: ["图片", "tupian", "tp", "image", "img", "picture", "photo", "!["],
  },
  {
    cmd: "video",
    label: "视频（上传）",
    hint: "上传",
    icon: Film,
    keywords: ["视频", "shipin", "sp", "video", "movie", "mp4", "upload"],
  },
];

/** 前缀优先、其次包含：前缀命中排前面，其余按原表顺序稳定排列 */
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
  /** `/` 自身的位置 */
  from: number;
  /** `/` 之后到光标之间的过滤词 */
  query: string;
  /** 高亮项在过滤结果中的下标 */
  index: number;
}

interface SlashFieldValue {
  open: SlashState | null;
  /** Esc 关掉的那个 `/` 的位置：光标还贴着它时不自动重开 */
  dismissed: number | null;
}

const EMPTY: SlashFieldValue = { open: null, dismissed: null };

/** 触发条件：`/` 前是行首或空白 —— `a/b`、`http://` 这类路径写法不该弹菜单 */
const TRIGGER = /(^|\s)\/([^\s/]*)$/;

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

/** 关闭菜单。value=true 表示「记住这个 `/`」（Esc 主动关掉，别马上弹回来） */
const closeSlash = StateEffect.define<boolean>();
/** 高亮项换行：键盘与鼠标共用同一份下标，所以只能由状态层裁决 */
const setSlashIndex = StateEffect.define<number>();

const slashField = StateField.define<SlashFieldValue>({
  create: () => EMPTY,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(closeSlash)) {
        return { open: null, dismissed: e.value ? (value.open?.from ?? null) : null };
      }
      if (e.is(setSlashIndex) && value.open) {
        return { ...value, open: { ...value.open, index: e.value } };
      }
    }
    // 文档与光标都没动就保持原值（同一个对象），React 侧据此判断无需重渲染
    if (!tr.docChanged && !tr.selection) return value;
    const next = detectSlash(tr.state);
    // `/` 已不在光标前（被删、移开、打了空格）：连 Esc 的记忆一起清掉，下次可正常触发
    if (!next) return EMPTY;
    if (next.from === value.dismissed) return { open: null, dismissed: value.dismissed };
    const items = filterSlashItems(next.query);
    // 同一个 `/` 且过滤词没变才保留高亮位置；一改过滤词就回到第一项
    const keep =
      value.open && value.open.from === next.from && value.open.query === next.query
        ? value.open.index
        : 0;
    return {
      open: { ...next, index: items.length ? Math.min(keep, items.length - 1) : 0 },
      dismissed: null,
    };
  },
});

export function slashStateOf(state: EditorState): SlashState | null {
  return state.field(slashField, false)?.open ?? null;
}

/** 选中一项：先一笔删掉 `/query`，再执行命令。
 *  两笔分开是必要的——insertBlock / prefixLines 都要读「删干净之后」的当前行，
 *  行首触发时删完是空行就不再补空行，行中触发时才另起一段 */
export function runSlashItem(view: EditorView, item: SlashItem, from: number, to: number) {
  view.dispatch({ changes: { from, to, insert: "" }, selection: { anchor: from } });
  runFormatCommand(view, item.cmd);
  view.focus();
}

function pickCurrent(view: EditorView): boolean {
  const st = slashStateOf(view.state);
  if (!st) return false;
  const items = filterSlashItems(st.query);
  // 无匹配时不消费 Enter/Tab，交回 CodeMirror 该换行换行、该缩进缩进
  const item = items[st.index];
  if (!item) return false;
  runSlashItem(view, item, st.from, st.from + 1 + st.query.length);
  return true;
}

function moveHighlight(view: EditorView, delta: number): boolean {
  const st = slashStateOf(view.state);
  if (!st) return false;
  const n = filterSlashItems(st.query).length;
  // 无匹配项时没有可高亮的行，↑↓ 放行给编辑器：光标离开这一行，菜单自然关掉
  if (!n) return false;
  view.dispatch({ effects: setSlashIndex.of((st.index + delta + n) % n) });
  return true;
}

/** 菜单开着才消费按键，否则一律 false 放行 —— ⌘B/⌘I/⌘K、Enter、Tab 都不受影响 */
const slashKeymap = Prec.highest(
  keymap.of([
    { key: "ArrowDown", run: (v) => moveHighlight(v, 1) },
    { key: "ArrowUp", run: (v) => moveHighlight(v, -1) },
    { key: "Enter", run: pickCurrent },
    { key: "Tab", run: pickCurrent },
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

/** 鼠标 hover 高亮：由 React 侧调进来，保证键鼠共用同一份下标 */
export function highlightSlashIndex(view: EditorView, index: number) {
  view.dispatch({ effects: setSlashIndex.of(index) });
}

/**
 * 装配扩展。onState 在菜单状态真的变了时才调用（含关闭时的 null），
 * 由 MarkdownEditor 推给 <SlashMenu>，避免走 props 引发整棵文章视图重渲染。
 */
export function slashMenu(onState: (s: SlashState | null) => void): Extension {
  return [
    slashField,
    slashKeymap,
    EditorView.updateListener.of((update) => {
      const prev = update.startState.field(slashField).open;
      const next = update.state.field(slashField).open;
      if (prev !== next) onState(next);
    }),
    EditorView.domEventHandlers({
      // 失焦即关：点到别处还挂着一块菜单是纯粹的干扰。
      // 菜单自己的 onMouseDown 会 preventDefault，点菜单不会走到这里
      blur: (_e, view) => {
        if (slashStateOf(view.state)) view.dispatch({ effects: closeSlash.of(false) });
        return false;
      },
    }),
  ];
}
