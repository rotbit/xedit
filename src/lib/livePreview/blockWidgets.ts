import MarkdownIt from "markdown-it";
import { EditorView, WidgetType } from "@codemirror/view";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { texToSvg } from "@/lib/markdown/mathjax";
import { mathJaxReady, refreshWhenMathReady } from "@/lib/livePreview/mathReady";
import { editOnClick } from "@/lib/livePreview/widgetUtils";

/** 即时渲染的块级部件（表格、$$ 公式）。跨行替换只能由状态字段提供，
 *  装饰构建见 blocks.ts。所有写进 DOM 的 HTML 一律先过 DOMPurify（sanitizeHtml） */

/** 单元格只跑 inline 渲染：块级规则会把一格内容再包成 <p>，撑坏表格行高。
 *  实例懒建一次，编辑器里每次重排都复用 */
let inlineMd: MarkdownIt | null = null;
function renderCell(source: string): string {
  if (!inlineMd) inlineMd = new MarkdownIt({ html: false });
  return sanitizeHtml(inlineMd.renderInline(source));
}

/** 单元格同时保留原文偏移，点击时直接定位到对应行列；转义交给 Markdown 渲染。 */
function splitRow(line: string): { text: string; from: number }[] {
  const cells: { text: string; from: number }[] = [];
  let start = 0;
  const addCell = (end: number) => {
    const raw = line.slice(start, end);
    cells.push({ text: raw.trim(), from: start + raw.length - raw.trimStart().length });
    start = end + 1;
  };
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") {
      i++;
      continue;
    }
    if (line[i] === "|") addCell(i);
  }
  addCell(line.length);
  if (line.trimStart().startsWith("|")) cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].text === "" && line.trimEnd().endsWith("|")) cells.pop();
  return cells;
}

/** 第二行分隔行决定各列对齐（:-- / --: / :-:） */
function parseAlign(cell: string): "left" | "right" | "center" | null {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

/** 表格一行的高度：单元格上下内边距 6+6，加 15px 字号 × 1.6 行高，取整约 33px
 *  （见 live-blocks.css 的 .cm-lp-table table 与 th/td） */
const TABLE_ROW_HEIGHT = 33;
/** 外框上下边框各 1px，再留一点零头（.cm-lp-table 的 border + border-radius） */
const TABLE_CHROME_HEIGHT = 4;

/** 公式块的估高：上下内边距各 10px（.cm-lp-math），加一行公式 SVG 的常见高度 */
const MATH_BLOCK_HEIGHT = 64;

export class TableWidget extends WidgetType {
  /** 切行只做一次：估高与建 DOM 都要按行走，而 source 变了就是另一个部件（见 eq） */
  private readonly rows: string[];
  constructor(readonly source: string) {
    super();
    this.rows = source.split("\n");
  }
  eq(other: TableWidget) {
    return other.source === this.source;
  }
  get estimatedHeight() {
    return this.rows.length * TABLE_ROW_HEIGHT + TABLE_CHROME_HEIGHT;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-table";
    const table = document.createElement("table");
    const { rows } = this;
    const aligns = (rows[1] ? splitRow(rows[1]) : []).map((cell) => parseAlign(cell.text));
    const head = document.createElement("thead");
    const body = document.createElement("tbody");

    let lineOffset = 0;
    rows.forEach((line, index) => {
      const rowOffset = lineOffset;
      lineOffset += line.length + 1;
      if (index === 1) return; // 分隔行只提供对齐信息，不出现在表里
      const tr = document.createElement("tr");
      splitRow(line).forEach((cell, col) => {
        const td = document.createElement(index === 0 ? "th" : "td");
        const align = aligns[col];
        if (align) td.style.textAlign = align;
        td.dataset.sourceOffset = String(rowOffset + cell.from);
        td.innerHTML = renderCell(cell.text);
        tr.appendChild(td);
      });
      (index === 0 ? head : body).appendChild(tr);
    });

    if (head.childElementCount > 0) table.appendChild(head);
    if (body.childElementCount > 0) table.appendChild(body);
    wrap.appendChild(table);
    // +1 跳过行首的 `|`：落在表格区间内部，装饰才会让位给源码
    editOnClick(wrap, view, 1);
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

/** MathJax 是异步动态加载的：首次渲染多半还没就绪，先出原文占位，就绪后由
 *  refreshLivePreview 触发重建（就绪状态与刷新见 mathReady.ts，行内公式共用同一份）。
 *  ready 进 eq 比较，否则部件“相等”会留住旧 DOM */
export class MathBlockWidget extends WidgetType {
  private readonly ready = mathJaxReady();
  constructor(readonly tex: string) {
    super();
  }
  eq(other: MathBlockWidget) {
    return other.tex === this.tex && other.ready === this.ready;
  }
  get estimatedHeight() {
    return MATH_BLOCK_HEIGHT;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-math";
    if (!this.ready) {
      const holder = document.createElement("span");
      holder.className = "cm-lp-math-loading";
      holder.textContent = this.tex;
      wrap.appendChild(holder);
      refreshWhenMathReady(view);
    } else {
      try {
        // texToSvg 产出的是 MathJax 自己的 SVG，仍按统一管线消毒后再入 DOM
        wrap.innerHTML = sanitizeHtml(texToSvg(this.tex, true));
      } catch {
        wrap.classList.add("cm-lp-math-error");
        wrap.textContent = this.tex;
      }
    }
    // +2 跳过开头的 `$$`：光标落进区间内部即还原源码
    editOnClick(wrap, view, 2);
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}
