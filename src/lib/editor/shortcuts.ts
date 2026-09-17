/**
 * 编辑器的格式快捷键表，以及两个键盘专用的行级命令（正文化、有序/无序列表）。
 *
 * 绑定统统走 commands.ts 的 runFormatCommand —— 和浮动工具条、斜杠菜单、命令面板
 * 同一个入口，格式行为只有一处定义。只有"变回正文"和"列表 toggle"在命令表里没有
 * 对应项（工具条上也没有这两个按钮），才在这里就地实现。
 *
 * 键位的取舍（mac）：
 * - ⌘⇧C 是 Chrome 的"检查元素"，网页拦不住，行内代码改用 ⌘⇧K；⌘` / ⌘⇧` 是 macOS
 *   的窗口轮换，同样到不了页面，不能用。
 * - ⌘E / ⌘⇧E / ⌘/ / ⌘⇧P / ⌘O / ⌘P 已经被 useEditorViewMode 和 Home 在 capture
 *   阶段全局吃掉了，这里一律避开。
 * - 标题用 ⌘⌥1/2/3，⌘⌥0 变回正文；⌘⌥ 组合在 Chrome/Safari 里是空的。
 */

import type { ChangeSpec, EditorState, Line } from "@codemirror/state";
import type { EditorView, KeyBinding } from "@codemirror/view";
import { runFormatCommand, type FormatCommand, type Notify } from "@/lib/editor/commands";

/** 选区覆盖到的行；选区正好停在下一行行首时不算上那一行（与 format.ts 同一套口径） */
function selectedLines(state: EditorState): Line[] {
  const range = state.selection.main;
  const first = state.doc.lineAt(range.from).number;
  const last = state.doc.lineAt(range.empty ? range.to : range.to - 1).number;
  const out: Line[] = [];
  for (let n = first; n <= last; n++) out.push(state.doc.line(n));
  return out;
}

/** 空选区时按 assoc=1 映射光标，免得改完前缀光标被留在新插入的标记前面（详见 format.ts） */
function applyLineChanges(view: EditorView, changes: ChangeSpec[]): void {
  const { state } = view;
  const range = state.selection.main;
  if (changes.length) {
    const set = state.changes(changes);
    view.dispatch({
      changes: set,
      ...(range.empty ? { selection: { anchor: set.mapPos(range.head, 1) } } : {}),
    });
  }
  view.focus();
}

/** 行首的标题记号；允许前面压着缩进和引用符，保留它们只摘 `#` */
const HEADING_HEAD = /^([ \t]*(?:>[ \t]*)*)(#{1,6})[ \t]+/;
/** 行首的列表标记，任务项的 `[ ]` 也算在标记里 */
const LIST_HEAD = /^([ \t]*)(?:[-*+]|\d+[.)])(?:[ \t]+\[[ xX]\])?[ \t]+/;
const BULLET_HEAD = /^[ \t]*[-*+][ \t]+(?!\[[ xX]\][ \t])/;
const ORDERED_HEAD = /^[ \t]*\d+[.)][ \t]+/;

/** 变回正文：只摘标题记号，缩进、引用和后面的文字都留着 */
export function toParagraph(view: EditorView): void {
  const changes: ChangeSpec[] = [];
  for (const line of selectedLines(view.state)) {
    const m = line.text.match(HEADING_HEAD);
    if (m) changes.push({ from: line.from + m[1].length, to: line.from + m[0].length, insert: "" });
  }
  applyLineChanges(view, changes);
}

/**
 * 无序/有序列表 toggle：选中的行全是这一种列表就摘标记，否则统一换成这一种
 * （原来是别的列表标记就地替换，不叠成 `- 1. `）。有序列表按选区内顺序重新编号，
 * 但不负责维护它上下文里已有的编号——那属于自动重排，另算。
 */
export function toggleList(view: EditorView, ordered: boolean): void {
  const lines = selectedLines(view.state);
  const head = ordered ? ORDERED_HEAD : BULLET_HEAD;
  const allSame = lines.every((line) => head.test(line.text));
  const changes: ChangeSpec[] = [];
  let index = 0;
  for (const line of lines) {
    const m = line.text.match(LIST_HEAD);
    const indent = m ? m[1] : line.text.slice(0, line.text.length - line.text.trimStart().length);
    const to = line.from + (m ? m[0].length : indent.length);
    index += 1;
    changes.push({
      from: line.from + indent.length,
      to,
      insert: allSame ? "" : ordered ? `${index}. ` : "- ",
    });
  }
  applyLineChanges(view, changes);
}

/** 快捷键与工具栏、斜杠菜单共用命令入口，格式行为只在命令层定义。 */
function formatKey(key: string, cmd: FormatCommand, notify: Notify): KeyBinding {
  return {
    key,
    run: (view) => {
      runFormatCommand(view, cmd, notify);
      return true;
    },
  };
}

function localKey(key: string, run: (view: EditorView) => void): KeyBinding {
  return {
    key,
    run: (view) => {
      run(view);
      return true;
    },
  };
}

export function formatShortcuts(notify: Notify): KeyBinding[] {
  return [
    formatKey("Mod-b", "bold", notify),
    formatKey("Mod-i", "italic", notify),
    formatKey("Mod-k", "link", notify),
    formatKey("Mod-Shift-x", "strike", notify),
    formatKey("Mod-Shift-k", "code", notify),
    formatKey("Mod-Alt-1", "h1", notify),
    formatKey("Mod-Alt-2", "h2", notify),
    formatKey("Mod-Alt-3", "h3", notify),
    localKey("Mod-Alt-0", toParagraph),
    formatKey("Mod-Shift-.", "quote", notify),
    localKey("Mod-Shift-8", (view) => toggleList(view, false)),
    localKey("Mod-Shift-7", (view) => toggleList(view, true)),
    formatKey("Mod-Shift-9", "tasklist", notify),
  ];
}
