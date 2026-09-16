// 输入 `[[` 时的文章标题补全：触发检测、StateField、keymap、候选过滤。
//
// 架构完全镜像斜杠菜单（lib/slashMenu.ts）：状态放 CodeMirror 而不是 React，
// 按键用 Prec.highest 的 keymap 抢在 defaultKeymap 之前，菜单没开时一律返回 false 放行。
// 唯一的差别在候选来源 —— 文库随时在增删改，放进 StateField 就得再写一套同步，
// 所以候选不进状态，过滤时现读 getDocs()，StateField 只存「开在哪、过滤词是什么」。

import { Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { caretInFencedCode } from "@/lib/livePreview/context";
import { normalizeTitle } from "@/lib/wikiLink";
import type { DocMeta } from "@/features/workspace/types";

/** 一次最多列 8 条文章：再多就得翻页，键盘选择反而变慢（「新建」项不占这 8 条） */
const LIMIT = 8;

/** 候选项：现有文章，或「按当前输入新建一篇」 */
export type WikiCandidate =
  | { kind: "doc"; title: string; doc: DocMeta }
  | { kind: "create"; title: string };

function byRecent(a: DocMeta, b: DocMeta): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

/**
 * 过滤候选：前缀命中排前、其次包含，同级内按更新时间倒序，最多 8 条。
 * 过滤词为空时给最近编辑的 8 篇（刚写过的文章最可能被链回）。
 * 过滤词非空且没有标题与之完全相等时，末尾追加「新建」项 —— 链一篇还不存在的文章
 * 是 Obsidian 式写作的常态，不该被迫先去建好再回来。
 */
export function filterWikiCandidates(docs: DocMeta[], query: string): WikiCandidate[] {
  // 无标题的文章没法被 `[[标题]]` 指到，列出来只会选了也没用
  const named = docs.filter((d) => d.title.trim()).sort(byRecent);
  const q = query.trim();
  const key = q.toLowerCase();
  const toItem = (doc: DocMeta): WikiCandidate => ({
    kind: "doc",
    title: doc.title.trim(),
    doc,
  });
  if (!key) return named.slice(0, LIMIT).map(toItem);

  const prefix: DocMeta[] = [];
  const contains: DocMeta[] = [];
  for (const doc of named) {
    const title = doc.title.toLowerCase();
    if (title.startsWith(key)) prefix.push(doc);
    else if (title.includes(key)) contains.push(doc);
  }
  const out = [...prefix, ...contains].slice(0, LIMIT).map(toItem);
  const exact = named.some((d) => normalizeTitle(d.title) === normalizeTitle(q));
  if (!exact) out.push({ kind: "create", title: q });
  return out;
}

export interface WikiMenuState {
  /** `[[` 中第一个 `[` 的位置 */
  from: number;
  /** `[[` 之后到光标之间的过滤词 */
  query: string;
  /** 高亮项在过滤结果中的下标 */
  index: number;
}

interface WikiFieldValue {
  open: WikiMenuState | null;
  /** Esc 关掉的那个 `[[` 的位置：光标还在它后面时不自动重开 */
  dismissed: number | null;
}

const EMPTY: WikiFieldValue = { open: null, dismissed: null };

/** `[[query` 的整段范围末端：选中后连它一起换成 `[[标题]]` */
export function wikiQueryEnd(st: WikiMenuState): number {
  return st.from + 2 + st.query.length;
}

/**
 * 触发条件：光标前同一行有个未闭合的 `[[`。
 * 取最近的那个 `[[` 作锚点，所以过滤词里天然不含 `[[`；再排除三种情况：
 * 含 `]`（这个链接已经闭合了）、含 `|`（用户在写别名，补全的是目标不是别名）、
 * 光标在围栏代码里（代码里的 `[[` 是数组下标之类，弹菜单只会碍事）。
 */
function detectWiki(state: EditorState): { from: number; query: string } | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  if (caretInFencedCode(state)) return null;
  const line = state.doc.lineAt(sel.head);
  const before = line.text.slice(0, sel.head - line.from);
  const open = before.lastIndexOf("[[");
  if (open === -1) return null;
  const query = before.slice(open + 2);
  if (query.includes("]") || query.includes("|")) return null;
  return { from: line.from + open, query };
}

/** 关闭菜单。value=true 表示「记住这个 `[[`」（Esc 主动关掉，别马上弹回来） */
const closeWiki = StateEffect.define<boolean>();
/** 高亮项换行：键盘与鼠标共用同一份下标，所以只能由状态层裁决 */
const setWikiIndex = StateEffect.define<number>();

const wikiField = StateField.define<WikiFieldValue>({
  create: () => EMPTY,
  update(prev, tr) {
    // dismissed 记的是文档里的绝对偏移：前方插入/删除文本后这个位置会漂，
    // 不跟着映射，Esc 关掉的那个 `[[` 就认不出来了（菜单会立刻弹回来）。
    // 不 docChanged 时保持同一个对象引用，React 侧的「无变化不重渲染」才成立。
    const value =
      tr.docChanged && prev.dismissed !== null
        ? { ...prev, dismissed: tr.changes.mapPos(prev.dismissed, -1) }
        : prev;
    for (const e of tr.effects) {
      if (e.is(closeWiki)) {
        return { open: null, dismissed: e.value ? (value.open?.from ?? null) : null };
      }
      if (e.is(setWikiIndex) && value.open) {
        return { ...value, open: { ...value.open, index: e.value } };
      }
    }
    // 文档与光标都没动就保持原值（同一个对象），React 侧据此判断无需重渲染
    if (!tr.docChanged && !tr.selection) return value;
    const next = detectWiki(tr.state);
    // `[[` 已不在光标前（被删、移开、链接闭合了）：连 Esc 的记忆一起清掉
    if (!next) return EMPTY;
    if (next.from === value.dismissed) return { open: null, dismissed: value.dismissed };
    // 同一个 `[[` 且过滤词没变才保留高亮位置；一改过滤词就回到第一项
    const keep =
      value.open && value.open.from === next.from && value.open.query === next.query
        ? value.open.index
        : 0;
    return { open: { ...next, index: keep }, dismissed: null };
  },
});

export function wikiMenuStateOf(state: EditorState): WikiMenuState | null {
  return state.field(wikiField, false)?.open ?? null;
}

/**
 * 选中一项：把 `[[query` 换成 `[[标题]]`，光标落到 `]]` 之后。
 * 光标后若已经有一对 `]]`（自动配对括号的编辑器会预先补上），连它一起吃掉，
 * 否则会留下 `[[标题]]]]`。「新建」项与普通项插入行为一致 ——
 * 这里只负责写链接，点开时若文章仍不存在，useWikiLinkOpen 会问要不要建。
 */
export function pickWikiItem(
  view: EditorView,
  item: WikiCandidate,
  from: number,
  to: number
): void {
  const insert = `[[${item.title.trim()}]]`;
  const end = view.state.doc.sliceString(to, to + 2) === "]]" ? to + 2 : to;
  view.dispatch({
    changes: { from, to: end, insert },
    selection: { anchor: from + insert.length },
  });
  view.focus();
}

/** 鼠标 hover 高亮：由 React 侧调进来，保证键鼠共用同一份下标 */
export function highlightWikiIndex(view: EditorView, index: number): void {
  view.dispatch({ effects: setWikiIndex.of(index) });
}

/** 下标可能落在过滤结果之外（文库刚变过），取最后一条兜底 */
export function activeWikiIndex(index: number, count: number): number {
  return count > 0 ? Math.min(index, count - 1) : 0;
}

function wikiKeymap(getDocs: () => DocMeta[]): Extension {
  const pickCurrent = (view: EditorView): boolean => {
    const st = wikiMenuStateOf(view.state);
    if (!st) return false;
    const items = filterWikiCandidates(getDocs(), st.query);
    // 无候选时不消费 Enter/Tab，交回 CodeMirror 该换行换行、该缩进缩进
    const item = items[activeWikiIndex(st.index, items.length)];
    if (!item) return false;
    pickWikiItem(view, item, st.from, wikiQueryEnd(st));
    return true;
  };

  const moveHighlight = (view: EditorView, delta: number): boolean => {
    const st = wikiMenuStateOf(view.state);
    if (!st) return false;
    const n = filterWikiCandidates(getDocs(), st.query).length;
    // 无候选项时没有可高亮的行，↑↓ 放行给编辑器：光标离开这一行，菜单自然关掉
    if (!n) return false;
    highlightWikiIndex(view, (activeWikiIndex(st.index, n) + delta + n) % n);
    return true;
  };

  // 菜单开着才消费按键，否则一律 false 放行 —— 斜杠菜单、⌘B/⌘I/⌘K 都不受影响
  return Prec.highest(
    keymap.of([
      { key: "ArrowDown", run: (v) => moveHighlight(v, 1) },
      { key: "ArrowUp", run: (v) => moveHighlight(v, -1) },
      { key: "Enter", run: pickCurrent },
      { key: "Tab", run: pickCurrent },
      {
        key: "Escape",
        run: (v) => {
          if (!wikiMenuStateOf(v.state)) return false;
          v.dispatch({ effects: closeWiki.of(true) });
          return true;
        },
      },
    ])
  );
}

/**
 * 装配扩展。onState 只在菜单状态真的变了时调用（含关闭时的 null），
 * 由 MarkdownEditor 推给 <WikiLinkMenu>；getDocs 每次过滤现读，文库变了立刻生效。
 */
export function wikiLinkMenu(options: {
  getDocs: () => DocMeta[];
  onState: (s: WikiMenuState | null) => void;
}): Extension {
  return [
    wikiField,
    wikiKeymap(options.getDocs),
    EditorView.updateListener.of((update) => {
      const prev = update.startState.field(wikiField).open;
      const next = update.state.field(wikiField).open;
      if (prev !== next) options.onState(next);
    }),
    EditorView.domEventHandlers({
      // 失焦即关；菜单自己的 onMouseDown 会 preventDefault，点菜单不会走到这里
      blur: (_e, view) => {
        if (wikiMenuStateOf(view.state)) view.dispatch({ effects: closeWiki.of(false) });
        return false;
      },
    }),
  ];
}
