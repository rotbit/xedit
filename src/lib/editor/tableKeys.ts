/**
 * 表格里的 Tab / Shift-Tab：在单元格之间跳，而不是给整行加缩进。
 *
 * 起因：默认的 indentWithTab 在表格行上按 Tab 会往行首插两个空格，表格当场错位，
 * 而且这个缩进还会顺着往下几行传染。写表格时 Tab 的本意只有一个——去下一格。
 *
 * 判定用语法树的 Table 节点；表格刚开头（只敲了表头行、还没有 `| --- |`）时解析不出
 * Table，就退回"整行以 `|` 起手"的形状判断，并且先排除围栏代码块（代码里的竖线是
 * 位运算、正则分支，不是表格）。
 */

import { EditorSelection, Prec, type EditorState, type Extension, type Line } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { caretInFencedCode } from "@/lib/livePreview/context";

interface Cell {
  /** 单元格的整段范围（含两侧填充空格），不含竖线本身 */
  from: number;
  to: number;
}

/** 分隔行 `| --- | :-: |`：它不是内容，Tab 一律跨过去 */
function isDelimiterRow(line: Line): boolean {
  return line.text.includes("-") && /^[\s|:-]+$/.test(line.text);
}

function isTableLine(line: Line): boolean {
  return line.text.trim().startsWith("|");
}

function inTableNode(state: EditorState, pos: number): boolean {
  for (const side of [-1, 1] as const) {
    for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side); n; n = n.parent) {
      if (n.name === "Table") return true;
    }
  }
  return false;
}

/** 按竖线切出这一行的各个格子；`\|` 是转义的竖线，不算分隔 */
function cellsOf(line: Line): Cell[] {
  const text = line.text;
  const bars: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "|") bars.push(i);
  }
  if (bars.length === 0) return [];
  const cells: Cell[] = [];
  // 行首/行尾的竖线可有可无：没有时，竖线外侧那一段也是一个格子
  if (text.slice(0, bars[0]).trim()) cells.push({ from: line.from, to: line.from + bars[0] });
  for (let i = 0; i + 1 < bars.length; i++) {
    cells.push({ from: line.from + bars[i] + 1, to: line.from + bars[i + 1] });
  }
  const tailAt = bars[bars.length - 1] + 1;
  if (text.slice(tailAt).trim()) cells.push({ from: line.from + tailAt, to: line.to });
  return cells;
}

/** 格子里的内容范围：跳到这一格时把内容选中，直接打字就是替换（空格子则只落光标） */
function contentRange(state: EditorState, cell: Cell): [number, number] {
  const text = state.sliceDoc(cell.from, cell.to);
  const lead = text.length - text.trimStart().length;
  const trail = text.length - text.trimEnd().length;
  if (lead + trail >= text.length) {
    const at = Math.min(cell.from + 1, cell.to);
    return [at, at];
  }
  return [cell.from + lead, cell.to - trail];
}

/** 表格占据的行号范围：从光标那行往两头看，连续的表格行都算 */
function rowRange(state: EditorState, line: Line): { first: number; last: number } {
  let first = line.number;
  let last = line.number;
  while (first > 1 && isTableLine(state.doc.line(first - 1))) first--;
  while (last < state.doc.lines && isTableLine(state.doc.line(last + 1))) last++;
  return { first, last };
}

/** 在最后一格再按 Tab：照抄列数补一行空行，光标落到新行第一格 */
function appendRow(view: EditorView, lastLine: Line, columns: number): void {
  const row = `|${"  |".repeat(Math.max(1, columns))}`;
  view.dispatch({
    changes: { from: lastLine.to, insert: `\n${row}` },
    // 换行符 + `| ` 之后正好是第一格里那个空位
    selection: { anchor: lastLine.to + 3 },
    userEvent: "input",
    scrollIntoView: true,
  });
}

function moveCell(view: EditorView, dir: 1 | -1): boolean {
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  if (caretInFencedCode(state)) return false;
  if (!inTableNode(state, pos) && !isTableLine(line)) return false;

  let cells = cellsOf(line);
  if (cells.length === 0) return false;
  const at = cells.findIndex((c) => pos >= c.from && pos <= c.to);
  // 光标落在首尾竖线外侧时当作"在第一格之前 / 最后一格之后"；
  // 光标本来就停在分隔行上（点进去过）则直接判为越界，让下面的循环把它带到相邻的内容行
  let next = isDelimiterRow(line)
    ? dir > 0
      ? cells.length
      : -1
    : (at < 0 ? (dir > 0 ? -1 : cells.length) : at) + dir;

  const { first, last } = rowRange(state, line);
  let row = line.number;
  while (next < 0 || next >= cells.length) {
    const step = row + dir;
    if (step < first || step > last) {
      // 往前越界：停在第一格不动，但仍然吞掉按键，免得 Tab 把整张表缩进了
      if (dir < 0) return true;
      appendRow(view, state.doc.line(last), cells.length);
      return true;
    }
    row = step;
    const stepLine = state.doc.line(row);
    if (isDelimiterRow(stepLine)) continue;
    cells = cellsOf(stepLine);
    next = dir > 0 ? 0 : cells.length - 1;
  }

  const [from, to] = contentRange(state, cells[next]);
  view.dispatch({ selection: EditorSelection.range(from, to), scrollIntoView: true });
  return true;
}

/** Prec.highest：必须跑在 markdownKeymap 与 indentWithTab 之前；
 *  不在表格里时返回 false，Tab 照旧缩进。Enter 不接管，换行行为保持默认 */
export const tableKeymap: Extension = Prec.highest(
  keymap.of([
    {
      key: "Tab",
      run: (view) => moveCell(view, 1),
      shift: (view) => moveCell(view, -1),
    },
  ])
);
