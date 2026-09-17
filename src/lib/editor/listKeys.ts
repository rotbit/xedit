/**
 * 空列表项 / 空引用行上的回车：退出，而不是再续一条。
 *
 * lang-markdown 自带的 insertNewlineContinueMarkup 在这两种情形下表现很怪：
 * 嵌套列表 "  - " 上回车会插出一行"只有一个空格"的脏行，标记还照样续着，要连按三四下
 * 才退得出来；"> " 上回车则永远退不出引用（一直续 "> "）。
 *
 * 所以在它前面（Prec.highest，markdownKeymap 是 Prec.high）截一手：只处理"整行除了
 * 标记什么都没有"这一种情况——有缩进就退一层，顶层就把标记摘掉留一行干净空行；
 * 其余一律返回 false 交回默认行为（正常续列表、续引用都还归它管）。
 */

import { Prec, type EditorState, type Extension, type Line } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import { caretInFencedCode } from "@/lib/livePreview/context";

/** 整行只有列表标记（含任务项的 `- [ ]`），后面最多跟些空白 */
const EMPTY_ITEM = /^([ \t]*)((?:[-*+]|\d+[.)])(?:[ \t]+\[[ xX]\])?)[ \t]*$/;
/** 整行只有引用标记：`>`、`> `、`> > ` 都算 */
const EMPTY_QUOTE = /^([ \t]*)((?:>[ \t]*)+)$/;
/** 任意一条列表项的行首，用来找上一层的缩进量 */
const ITEM_HEAD = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]/;

/** 整行替换成 text，光标停在行尾（text 为空时即行首） */
function replaceLine(view: EditorView, line: Line, text: string): true {
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: text },
    selection: { anchor: line.from + text.length },
    userEvent: "delete",
    scrollIntoView: true,
  });
  return true;
}

/**
 * 退一层用的缩进：照抄上文最近的、比自己浅的那条列表项。
 * 不直接按 indentUnit 砍固定格数——别处粘进来的列表常是 4 空格缩进，砍 2 格会卡在半层上。
 */
function outerIndent(state: EditorState, line: Line, indent: string): string {
  for (let n = line.number - 1; n >= 1; n--) {
    const text = state.doc.line(n).text;
    if (!text.trim()) break; // 空行 = 上一段列表已经断了，没有可对齐的上一层
    const m = text.match(ITEM_HEAD);
    if (m && m[1].length < indent.length) return m[1];
  }
  const unit = state.facet(indentUnit).length || 2;
  if (indent.endsWith("\t")) return indent.slice(0, -1);
  return indent.slice(0, Math.max(0, indent.length - unit));
}

function exitEmptyBlock(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;
  // 围栏代码里的 "- " 只是代码文本，回车该换行就换行
  if (caretInFencedCode(state)) return false;
  const line = state.doc.lineAt(range.head);

  const item = line.text.match(EMPTY_ITEM);
  if (item) {
    const [, indent, marker] = item;
    if (!indent) return replaceLine(view, line, "");
    return replaceLine(view, line, `${outerIndent(state, line, indent)}${marker} `);
  }

  const quote = line.text.match(EMPTY_QUOTE);
  if (quote) {
    const [, indent, markers] = quote;
    const levels = (markers.match(/>/g) ?? []).length;
    // 嵌套引用一层一层退，退到最外层才真的离开引用
    return replaceLine(view, line, levels > 1 ? `${indent}${"> ".repeat(levels - 1)}` : "");
  }

  return false;
}

/** Tab / Shift-Tab 不在这里接管：indentWithTab 走的 indentMore/indentLess 正好是
 *  "在行首加/减一个 indentUnit"，对列表项就是缩进一层，行为已经是对的 */
export const listKeymap: Extension = Prec.highest(keymap.of([{ key: "Enter", run: exitEmptyBlock }]));
