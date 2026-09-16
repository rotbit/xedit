/** 行内与行级格式的底层文本变换：识别已有标记、构造包裹事务，供命令层（commands.ts）调用。 */

import { EditorSelection, type ChangeSpec, type EditorState, type SelectionRange } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { EditorView } from "@codemirror/view";
import {
  COLOR_SPAN_CLOSE,
  COLOR_SPAN_LOOKBACK,
  COLOR_SPAN_OPEN_AT_END,
  COLOR_SPAN_WRAPPED,
  colorSpanOpen,
} from "@/lib/editor/colorSpan";

const INLINE_MARKUP = {
  "**": { node: "StrongEmphasis", mark: "EmphasisMark" },
  "*": { node: "Emphasis", mark: "EmphasisMark" },
  "~~": { node: "Strikethrough", mark: "StrikethroughMark" },
  "`": { node: "InlineCode", mark: "CodeMark" },
} as const;
type InlineMarker = keyof typeof INLINE_MARKUP;

/** 用语法节点识别已有格式，避免把加粗的两个星号误当成斜体标记。 */
function selectedMarkup(state: EditorState, range: SelectionRange, marker: InlineMarker) {
  const syntax = INLINE_MARKUP[marker];
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(range.from, 1); node; node = node.parent) {
    if (node.name !== syntax.node || node.to < range.to) continue;
    const marks = node.getChildren(syntax.mark);
    if (marks.length !== 2) continue;
    const [open, close] = marks;
    const innerSelected = range.from === open.to && range.to === close.from;
    const wholeSelected = range.from === node.from && range.to === node.to;
    if (range.empty || innerSelected || wholeSelected) return { open, close };
  }
  return null;
}

/** 选区止于下一行行首时，不把未选中文字的下一行也转换格式。 */
function selectedLines(state: EditorState) {
  const range = state.selection.main;
  return {
    first: state.doc.lineAt(range.from).number,
    last: state.doc.lineAt(range.empty ? range.to : range.to - 1).number,
  };
}

/** 构造包裹选区的事务片段，普通插入与格式切换共用。 */
function wrapRange(state: EditorState, range: SelectionRange, before: string, after: string, placeholder: string) {
  const text = state.doc.sliceString(range.from, range.to) || placeholder;
  return {
    changes: { from: range.from, to: range.to, insert: `${before}${text}${after}` },
    range: EditorSelection.range(range.from + before.length, range.from + before.length + text.length),
  };
}

/** 添加前后缀，保留内容选区；用于链接等不具备切换语义的插入命令。 */
export function wrapSelection(view: EditorView, before: string, after: string, placeholder: string) {
  const { state } = view;
  view.dispatch(state.changeByRange((range) => wrapRange(state, range, before, after, placeholder)));
  view.focus();
}

/** 添加或取消行内格式；取消时只删除定界符，保留内容和嵌套格式。 */
export function toggleInlineFormat(view: EditorView, marker: InlineMarker, placeholder: string) {
  const { state } = view;
  const changes = state.changeByRange((range) => {
    const marked = selectedMarkup(state, range, marker);
    if (!marked) return wrapRange(state, range, marker, marker, placeholder);
    const { open, close } = marked;
    const innerLength = close.from - open.to;
    const anchor = range.empty ? Math.max(0, Math.min(innerLength, range.head - open.to)) : 0;
    return {
      changes: [{ from: open.from, to: open.to }, { from: close.from, to: close.to }],
      range: EditorSelection.range(open.from + anchor, open.from + (range.empty ? anchor : innerLength)),
    };
  });
  view.dispatch(changes);
  view.focus();
}

/** 字体颜色：Markdown 没有颜色语法，用内联 <span style="color:…"> 承载
 *  （预览、公众号复制链路已放行该形态）。color 传 null 表示清除颜色。
 *  选区恰好是一个颜色 span、或恰好是其内部文字时，就地改写/剥掉原标签，避免嵌套套娃 */
export function applyColor(view: EditorView, color: string | null) {
  const { state } = view;
  const changes = state.changeByRange((range) => {
    let { from, to } = range;
    // 选区两侧紧贴着一对颜色标签（比如刚上完色又换色）：扩到整个标签一起改写
    const beforeText = state.doc.sliceString(Math.max(0, from - COLOR_SPAN_LOOKBACK), from);
    const openAtLeft = beforeText.match(COLOR_SPAN_OPEN_AT_END);
    if (openAtLeft && state.doc.sliceString(to, to + COLOR_SPAN_CLOSE.length) === COLOR_SPAN_CLOSE) {
      from -= openAtLeft[0].length;
      to += COLOR_SPAN_CLOSE.length;
    }
    const text = state.doc.sliceString(from, to);
    const wrapped = text.match(COLOR_SPAN_WRAPPED);
    if (color === null && !wrapped) return { range }; // 没颜色可清，原样不动
    const inner = (wrapped ? wrapped[1] : text) || "有色文字";
    const open = color === null ? "" : colorSpanOpen(color);
    const insert = color === null ? inner : `${open}${inner}${COLOR_SPAN_CLOSE}`;
    return {
      changes: { from, to, insert },
      range: EditorSelection.range(from + open.length, from + open.length + inner.length),
    };
  });
  view.dispatch(changes);
  view.focus();
}

/**
 * 行级命令（加前缀、标题、任务项）的共同收尾：应用改动，空选区时把光标按 assoc=1 映射。
 *
 * 事务默认按 assoc=-1 映射选区，光标恰在行首（斜杠菜单删完 "/query" 就是这种情况）时
 * 会被留在插入的 "# " 前面，接着打字就成了 "标题# "；空行上点任务按钮同理，光标要落到
 * 标记之后才能直接接着打字。非空选区照默认映射，保住用户选中的范围。
 */
function dispatchKeepingCaret(view: EditorView, changes: ChangeSpec[], range: SelectionRange) {
  const changeSet = view.state.changes(changes);
  view.dispatch({
    changes: changeSet,
    ...(range.empty ? { selection: { anchor: changeSet.mapPos(range.head, 1) } } : {}),
  });
  view.focus();
}

export function prefixLines(view: EditorView, prefix: string) {
  const { state } = view;
  const { first, last } = selectedLines(state);
  const changes: ChangeSpec[] = [];
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    // 已有相同前缀则移除（toggle）
    if (line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: "" });
    } else {
      changes.push({ from: line.from, insert: prefix });
    }
  }
  dispatchKeepingCaret(view, changes, state.selection.main);
}

/** 标题级别互相替换；保留引用、列表及缩进前缀，重复应用同级标题则回到正文。 */
export function toggleHeading(view: EditorView, level: number) {
  const { state } = view;
  const { first, last } = selectedLines(state);
  const prefix = `${"#".repeat(level)} `;
  const changes: ChangeSpec[] = [];
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    const container = line.text.match(/^[ \t]*(?:>[ \t]*)*(?:(?:[-+*]|\d+[.)])[ \t]+)?/)![0];
    const existing = line.text.slice(container.length).match(/^(#{1,6})[ \t]+/);
    const from = line.from + container.length;
    changes.push({
      from,
      to: from + (existing?.[0].length ?? 0),
      insert: existing?.[1].length === level ? "" : prefix,
    });
  }
  dispatchKeepingCaret(view, changes, state.selection.main);
}

const TASK_ITEM = /^(\s*)[-*+] \[[ xX]\] /;
const BULLET_ITEM = /^\s*[-*+] /;

/** 任务列表 toggle：已是任务项 → 摘掉标记退回普通文字（勾没勾都摘）；
 *  已是无序列表项 → 就地补上 [ ]，不再套一层 -；其余（含空行）→ 补完整的 "- [ ] "。
 *  缩进一律保留，嵌套层级不会被拉平 */
export function toggleTaskLines(view: EditorView) {
  const { state } = view;
  const { first, last } = selectedLines(state);
  const changes: ChangeSpec[] = [];
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    const task = line.text.match(TASK_ITEM);
    if (task) {
      changes.push({
        from: line.from + task[1].length,
        to: line.from + task[0].length,
        insert: "",
      });
      continue;
    }
    const bullet = line.text.match(BULLET_ITEM);
    if (bullet) {
      changes.push({ from: line.from + bullet[0].length, insert: "[ ] " });
      continue;
    }
    const indent = line.text.length - line.text.trimStart().length;
    changes.push({ from: line.from + indent, insert: "- [ ] " });
  }
  dispatchKeepingCaret(view, changes, state.selection.main);
}

export function insertBlock(view: EditorView, text: string) {
  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const needLeadingNewline = line.text.trim() !== "";
  const insert = `${needLeadingNewline ? "\n\n" : ""}${text}\n`;
  const pos = line.to;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
  });
  view.focus();
}

/**
 * 插入提示块：光标停在 `> [!tip] ` 之后，接着就能写标题，不写标题直接换行也成立。
 * 不复用 insertBlock —— 它会在插入内容后再补一个换行并把光标送到下一行，
 * 提示块要的恰恰是留在记号那一行继续打字。
 */
export function insertCallout(view: EditorView, type = "tip") {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.from);
  // 当前行还有字就另起一段，免得把提示块接在别人段尾
  const insert = `${line.text.trim() ? "\n\n" : ""}> [!${type}] `;
  const pos = line.to;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
    scrollIntoView: true,
  });
  view.focus();
}

/** 插入围栏代码块：不塞示例代码，光标落到块内空行；有选区时把选中文字收进块里 */
export function insertCodeBlock(view: EditorView): void {
  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  if (!range.empty) {
    // 选中的文字直接收进围栏；只有当选区左边还压着正文时才另起一行，免得凭空多出空行
    const body = state.sliceDoc(range.from, range.to);
    const head = `${line.text.slice(0, range.from - line.from).trim() ? "\n" : ""}\`\`\`\n`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: `${head}${body}\n\`\`\`\n` },
      selection: { anchor: range.from + head.length + body.length },
      scrollIntoView: true,
    });
    view.focus();
    return;
  }
  // 空选区：与 insertBlock 一样落在行尾，光标停在开栏与闭栏之间那行空行上，直接开写
  const head = `${line.text.trim() ? "\n\n" : ""}\`\`\`\n`;
  const pos = line.to;
  view.dispatch({
    changes: { from: pos, insert: `${head}\n\`\`\`\n` },
    selection: { anchor: pos + head.length },
    scrollIntoView: true,
  });
  view.focus();
}

export const TABLE_TEMPLATE = `| 表头 | 表头 |
| --- | --- |
| 内容 | 内容 |
| 内容 | 内容 |`;
