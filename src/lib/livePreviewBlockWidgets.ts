import MarkdownIt from "markdown-it";
import { EditorView, WidgetType } from "@codemirror/view";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { ensureMathJax, texToSvg } from "@/lib/markdown/mathjax";
import { refreshLivePreview } from "@/lib/livePreviewContext";

/** 即时渲染的块级部件（表格、$$ 公式）。跨行替换只能由状态字段提供，
 *  装饰构建见 livePreviewBlocks.ts。所有写进 DOM 的 HTML 一律先过 DOMPurify（sanitizeHtml） */

/** 单元格只跑 inline 渲染：块级规则会把一格内容再包成 <p>，撑坏表格行高。
 *  实例懒建一次，编辑器里每次重排都复用 */
let inlineMd: MarkdownIt | null = null;
function renderCell(source: string): string {
  if (!inlineMd) inlineMd = new MarkdownIt({ html: false });
  return sanitizeHtml(inlineMd.renderInline(source));
}

/** 按未转义的 `|` 切一行单元格；首尾管道产生的空格子丢掉，中间的空格子要留 */
function splitRow(line: string): string[] {
  const text = line.trim();
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && text[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  if (text.startsWith("|")) cells.shift();
  if (cells.length > 0 && /(^|[^\\])\|$/.test(text)) cells.pop();
  return cells.map((c) => c.trim());
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

/** 点击块级部件＝有意编辑：把光标送进语法内部（严格落在区间内才会还原源码） */
function editOnClick(el: HTMLElement, view: EditorView, offset: number) {
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = view.posAtDOM(el);
    view.dispatch({ selection: { anchor: pos + offset }, scrollIntoView: true });
    view.focus();
  });
}

export class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  eq(other: TableWidget) {
    return other.source === this.source;
  }
  get estimatedHeight() {
    return this.source.split("\n").length * 33 + 4;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-table";
    const table = document.createElement("table");
    const rows = this.source.split("\n").filter((l) => l.trim() !== "");
    const aligns = (rows[1] ? splitRow(rows[1]) : []).map(parseAlign);
    const head = document.createElement("thead");
    const body = document.createElement("tbody");

    rows.forEach((line, index) => {
      if (index === 1) return; // 分隔行只提供对齐信息，不出现在表里
      const tr = document.createElement("tr");
      splitRow(line).forEach((cell, col) => {
        const td = document.createElement(index === 0 ? "th" : "td");
        const align = aligns[col];
        if (align) td.style.textAlign = align;
        td.innerHTML = renderCell(cell);
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

/** MathJax 是异步动态加载的：首次渲染多半还没就绪，先出原文占位，
 *  就绪后由 refreshLivePreview 触发重建。ready 进 eq 比较，否则部件“相等”会留住旧 DOM */
let mathReady = false;

export class MathBlockWidget extends WidgetType {
  private readonly ready = mathReady;
  constructor(readonly tex: string) {
    super();
  }
  eq(other: MathBlockWidget) {
    return other.tex === this.tex && other.ready === this.ready;
  }
  get estimatedHeight() {
    return 64;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-math";
    if (!this.ready) {
      const holder = document.createElement("span");
      holder.className = "cm-lp-math-loading";
      holder.textContent = this.tex;
      wrap.appendChild(holder);
      void ensureMathJax().then(() => {
        mathReady = true;
        // 等一帧再派发：避开 CodeMirror 更新周期内再次 dispatch
        requestAnimationFrame(() => {
          if (view.dom.isConnected) view.dispatch({ effects: refreshLivePreview.of(null) });
        });
      });
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
