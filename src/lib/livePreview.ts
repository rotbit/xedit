import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension, Range } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";

/**
 * 即时渲染（类 Obsidian Live Preview）：
 * 在编辑器内直接呈现排版效果——隐藏语法标记、行内渲染图片/引用/任务清单，
 * 光标所在行还原为源码，随写随编。
 */

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-lp-image";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt || "图片";
    wrap.appendChild(img);
    return wrap;
  }
  // 点击图片交给编辑器定位光标 → 该行还原为源码
  ignoreEvent() {
    return false;
  }
}

class HrWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-lp-hr";
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-lp-bullet";
    el.textContent = "•";
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-lp-checkbox";
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(box);
      const marker = view.state.sliceDoc(pos, pos + 3);
      if (/^\[[ xX]\]$/.test(marker)) {
        view.dispatch({
          changes: { from: pos, to: pos + 3, insert: this.checked ? "[ ]" : "[x]" },
        });
      }
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

/** 选区覆盖的整行区间：落在这些行上的语法标记还原为源码 */
function selectionLineRanges(state: EditorState): { from: number; to: number }[] {
  return state.selection.ranges.map((r) => ({
    from: state.doc.lineAt(r.from).from,
    to: state.doc.lineAt(r.to).to,
  }));
}

function revealed(ranges: { from: number; to: number }[], from: number, to: number) {
  return ranges.some((r) => from <= r.to && to >= r.from);
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const reveal = selectionLineRanges(state);
  const decos: Range<Decoration>[] = [];
  const hide = (from: number, to: number) => {
    if (from < to) decos.push(Decoration.replace({}).range(from, to));
  };
  /** 隐藏标记及其后紧跟的一个空格 */
  const hideWithSpace = (from: number, to: number) => {
    hide(from, state.sliceDoc(to, to + 1) === " " ? to + 1 : to);
  };
  const eachLine = (from: number, to: number, cls: (n: number, first: number, last: number) => string) => {
    const first = state.doc.lineAt(from).number;
    const last = state.doc.lineAt(to).number;
    for (let n = first; n <= last; n++) {
      decos.push(Decoration.line({ class: cls(n, first, last) }).range(state.doc.line(n).from));
    }
  };

  for (const range of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        const { name } = node;
        const show = () => revealed(reveal, node.from, node.to);

        if (/^ATXHeading[1-6]$/.test(name)) {
          if (!show()) {
            const mark = node.node.getChild("HeaderMark");
            if (mark) hideWithSpace(mark.from, mark.to);
          }
          return;
        }
        if (name === "Emphasis" || name === "StrongEmphasis") {
          if (!show()) for (const m of node.node.getChildren("EmphasisMark")) hide(m.from, m.to);
          return;
        }
        if (name === "InlineCode") {
          if (!show()) for (const m of node.node.getChildren("CodeMark")) hide(m.from, m.to);
          return;
        }
        if (name === "Strikethrough") {
          if (!show()) for (const m of node.node.getChildren("StrikethroughMark")) hide(m.from, m.to);
          return;
        }
        if (name === "Link") {
          if (!show()) {
            const n = node.node;
            const marks = n.getChildren("LinkMark");
            const url = n.getChild("URL");
            const title = n.getChild("LinkTitle");
            for (const m of marks) hide(m.from, m.to);
            if (url) hide(url.from, url.to);
            if (title) hide(title.from, title.to);
            // 链接文字提示 URL，Cmd/Ctrl+点击打开
            const href = url ? state.sliceDoc(url.from, url.to) : "";
            if (href && marks.length >= 2 && marks[1].from > marks[0].to) {
              decos.push(
                Decoration.mark({
                  class: "cm-lp-link",
                  attributes: { "data-lp-href": href, title: `${href}\nCmd+点击打开` },
                }).range(marks[0].to, marks[1].from)
              );
            }
          }
          return;
        }
        if (name === "Image") {
          if (!show()) {
            const n = node.node;
            const url = n.getChild("URL");
            const marks = n.getChildren("LinkMark");
            const src = url ? state.sliceDoc(url.from, url.to) : "";
            const alt = marks.length >= 2 ? state.sliceDoc(marks[0].to, marks[1].from) : "";
            if (src) {
              decos.push(
                Decoration.replace({ widget: new ImageWidget(src, alt) }).range(node.from, node.to)
              );
            }
          }
          return false; // 内部标记已整体处理
        }
        if (name === "HorizontalRule") {
          if (!show()) {
            decos.push(Decoration.replace({ widget: new HrWidget() }).range(node.from, node.to));
          }
          return;
        }
        if (name === "Blockquote") {
          eachLine(node.from, node.to, () => "cm-lp-quote");
          return;
        }
        if (name === "QuoteMark") {
          if (!revealed(reveal, node.from, node.to)) hideWithSpace(node.from, node.to);
          return;
        }
        if (name === "FencedCode") {
          eachLine(node.from, node.to, (n, first, last) =>
            n === first
              ? "cm-lp-code cm-lp-code-first"
              : n === last
                ? "cm-lp-code cm-lp-code-last"
                : "cm-lp-code"
          );
          return;
        }
        if (name === "ListMark") {
          if (revealed(reveal, node.from, node.to)) return;
          if (node.node.parent?.parent?.name !== "BulletList") return; // 有序列表数字保留
          if (/^ \[[ xX]\]/.test(state.sliceDoc(node.to, node.to + 4))) {
            hide(node.from, node.to + 1); // 任务项只留 checkbox
          } else {
            decos.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
          }
          return;
        }
        if (name === "TaskMarker") {
          if (!revealed(reveal, node.from, node.to)) {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to));
            decos.push(
              Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to)
            );
          }
          return;
        }
      },
    });
  }
  return Decoration.set(decos, true);
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

export const livePreview: Extension = [
  livePreviewPlugin,
  EditorView.editorAttributes.of({ class: "cm-live-preview" }),
  EditorView.domEventHandlers({
    mousedown: (e) => {
      if (!(e.metaKey || e.ctrlKey)) return false;
      const el = (e.target as HTMLElement).closest?.("[data-lp-href]");
      const href = el?.getAttribute("data-lp-href");
      if (href) {
        window.open(href, "_blank", "noopener");
        e.preventDefault();
        return true;
      }
      return false;
    },
  }),
];
