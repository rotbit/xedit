import type { SyntaxNode } from "@lezer/common";
import { syntaxTree } from "@codemirror/language";
import {
  RangeSet,
  StateEffect,
  type EditorState,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { isVideoUrl, posterFromTitle } from "@/lib/media";
import {
  BulletWidget,
  CheckboxWidget,
  CodeLangWidget,
  HrWidget,
  ImageWidget,
  VideoWidget,
} from "@/lib/livePreviewWidgets";

/**
 * 即时渲染（类 Obsidian Live Preview）——节点级还原策略：
 * 隐藏语法标记、行内渲染图片/引用/任务清单，但还原粒度是「语法节点」而非「整行」，
 * 保证光标的被动移动（上下键路过、点击定位）不引起正文位移：
 * - 行内标记（**、`、~~、链接）：光标进入该语法范围内才显示标记，位移只发生在焦点处
 * - 行首标记（#、>）：永远可见但淡化缩小，任何光标移动都零位移
 * - 图片/分割线：atomicRanges 让光标只停在两侧，路过不还原；点击部件才展开源码
 */

/** 光标位置集合（仅空选区）：节点级还原的判定依据 */
function caretPositions(state: EditorState): number[] {
  return state.selection.ranges.filter((r) => r.empty).map((r) => r.head);
}

function hasTextSelection(state: EditorState) {
  return state.selection.ranges.some((range) => !range.empty);
}

/** 任一选区（含非空）与 [from, to] 有交叠 —— 围栏行的还原判定要用它：
    被选中的行必须现出原文，否则选区落在被隐藏的文本上（如双击选中
    看不见的闭合 ```），用户既看不到选了什么，也看不到光标 */
function selectionTouches(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((r) => r.to >= from && r.from <= to);
}

/** 光标落在 [from, to]（含边界）内 —— 行内语法的还原判定 */
function caretTouches(caret: number[], from: number, to: number) {
  return caret.some((p) => p >= from && p <= to);
}

/** 光标严格位于 (from, to) 内部 —— 图片/分割线的还原判定。
    边界不算：上下键路过时光标只会停在边界（atomicRanges 保证），不触发还原 */
function caretInside(caret: number[], from: number, to: number) {
  return caret.some((p) => p > from && p < to);
}

interface Built {
  decorations: DecorationSet;
  /** 图片/分割线的替换范围：光标移动按整体跳过，不落入内部 */
  atomics: DecorationSet;
}

function buildDecorations(view: EditorView, caret: number[]): Built {
  const { state } = view;
  const decos: Range<Decoration>[] = [];
  const atomics: Range<Decoration>[] = [];
  const hide = (from: number, to: number) => {
    if (from < to) decos.push(Decoration.replace({}).range(from, to));
  };
  /** 行首标记（#、>）连同其后空格淡化缩小：永远占位，光标经过零位移 */
  const faintMark = (from: number, to: number) => {
    const end = state.sliceDoc(to, to + 1) === " " ? to + 1 : to;
    if (from < end) decos.push(Decoration.mark({ class: "cm-lp-mark" }).range(from, end));
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

        if (/^ATXHeading[1-6]$/.test(name)) {
          // 标题行级样式（宋体、层级字号、块级呼吸空间）——静态类，不随光标变化
          const level = Math.min(4, Number(name.slice(-1)));
          decos.push(
            Decoration.line({ class: `cm-lp-h${level}` }).range(state.doc.lineAt(node.from).from)
          );
          const mark = node.node.getChild("HeaderMark");
          if (mark) faintMark(mark.from, mark.to);
          return;
        }
        if (name === "SetextHeading1" || name === "SetextHeading2") {
          decos.push(
            Decoration.line({ class: name === "SetextHeading1" ? "cm-lp-h1" : "cm-lp-h2" }).range(
              state.doc.lineAt(node.from).from
            )
          );
          for (const m of node.node.getChildren("HeaderMark")) faintMark(m.from, m.to);
          return;
        }
        if (name === "Emphasis" || name === "StrongEmphasis") {
          if (!caretTouches(caret, node.from, node.to))
            for (const m of node.node.getChildren("EmphasisMark")) hide(m.from, m.to);
          return;
        }
        if (name === "HTMLTag") {
          // 工具栏字体颜色写出的 <span style="color:…">…</span>：
          // 隐藏首尾标签、中间文字直接上色；光标进入范围才还原源码可编辑
          const open = state.sliceDoc(node.from, node.to).match(/^<span style="color:([^"]*)">$/);
          if (!open) return;
          // 向后找配对的 </span>（中间可能嵌套别的 span，按深度计数）
          let depth = 1;
          let close: typeof node.node | null = null;
          for (let sib = node.node.nextSibling; sib; sib = sib.nextSibling) {
            if (sib.name !== "HTMLTag") continue;
            const t = state.sliceDoc(sib.from, sib.to);
            if (/^<span[\s>]/i.test(t)) depth++;
            else if (/^<\/span\s*>$/i.test(t) && --depth === 0) {
              close = sib;
              break;
            }
          }
          if (!close || caretTouches(caret, node.from, close.to)) return;
          hide(node.from, node.to);
          hide(close.from, close.to);
          if (close.from > node.to) {
            decos.push(
              Decoration.mark({ attributes: { style: `color:${open[1]}` } }).range(
                node.to,
                close.from
              )
            );
          }
          return;
        }
        if (name === "InlineCode") {
          if (!caretTouches(caret, node.from, node.to)) {
            const marks = node.node.getChildren("CodeMark");
            for (const m of marks) hide(m.from, m.to);
            // 内容打上胶囊样式（内衬 + 圆角），只作用于行内代码，不波及代码块
            if (marks.length >= 2 && marks[1].from > marks[0].to) {
              decos.push(
                Decoration.mark({ class: "cm-lp-ic" }).range(marks[0].to, marks[1].from)
              );
            }
          }
          return;
        }
        if (name === "Strikethrough") {
          if (!caretTouches(caret, node.from, node.to))
            for (const m of node.node.getChildren("StrikethroughMark")) hide(m.from, m.to);
          return;
        }
        if (name === "Link") {
          if (!caretTouches(caret, node.from, node.to)) {
            const n = node.node;
            const marks = n.getChildren("LinkMark");
            const url = n.getChild("URL");
            const title = n.getChild("LinkTitle");
            for (const m of marks) hide(m.from, m.to);
            if (url) hide(url.from, url.to);
            if (title) hide(title.from, title.to);
            // 链接文字提示 URL，点击直接打开（⌥+点击进入源码编辑）
            const href = url ? state.sliceDoc(url.from, url.to) : "";
            if (href && marks.length >= 2 && marks[1].from > marks[0].to) {
              decos.push(
                Decoration.mark({
                  class: "cm-lp-link",
                  attributes: { "data-lp-href": href, title: `${href}\n点击打开 · ⌥+点击编辑` },
                }).range(marks[0].to, marks[1].from)
              );
            }
          }
          return;
        }
        if (name === "URL") {
          // 裸链接 / 自动链接：Link、Image 里的 URL 已由整体处理，这里只管独立出现的
          const parent = node.node.parent?.name;
          if (parent === "Link" || parent === "Image") return;
          if (caretTouches(caret, node.from, node.to)) return; // 编辑中不拦点击
          const raw = state.sliceDoc(node.from, node.to);
          const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
          decos.push(
            Decoration.mark({
              class: "cm-lp-link",
              attributes: { "data-lp-href": href, title: "点击打开 · ⌥+点击编辑" },
            }).range(node.from, node.to)
          );
          return;
        }
        if (name === "Image") {
          if (!caretInside(caret, node.from, node.to)) {
            const n = node.node;
            const url = n.getChild("URL");
            const marks = n.getChildren("LinkMark");
            const src = url ? state.sliceDoc(url.from, url.to) : "";
            const alt = marks.length >= 2 ? state.sliceDoc(marks[0].to, marks[1].from) : "";
            if (src) {
              // 视频复用图片语法，title 位携带 poster= 封面约定
              const titleNode = n.getChild("LinkTitle");
              const rawTitle = titleNode
                ? state.sliceDoc(titleNode.from, titleNode.to).replace(/^["'(]|["')]$/g, "")
                : "";
              const widget = isVideoUrl(src)
                ? new VideoWidget(src, alt, posterFromTitle(rawTitle))
                : new ImageWidget(src, alt);
              const deco = Decoration.replace({ widget }).range(node.from, node.to);
              decos.push(deco);
              atomics.push(deco);
            }
          }
          return false; // 内部标记已整体处理
        }
        if (name === "HorizontalRule") {
          if (!caretInside(caret, node.from, node.to)) {
            const deco = Decoration.replace({ widget: new HrWidget() }).range(node.from, node.to);
            decos.push(deco);
            atomics.push(deco);
          }
          return;
        }
        if (name === "Blockquote") {
          eachLine(node.from, node.to, () => "cm-lp-quote");
          return;
        }
        if (name === "QuoteMark") {
          faintMark(node.from, node.to);
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
          // 开栏行换语言下拉、闭栏行隐藏：光标落到该行才还原 ``` 源码
          const marks = node.node.getChildren("CodeMark");
          const info = node.node.getChild("CodeInfo");
          const firstLine = state.doc.lineAt(node.from);
          if (
            marks.length > 0 &&
            !caretTouches(caret, firstLine.from, firstLine.to) &&
            !selectionTouches(state, firstLine.from, firstLine.to)
          ) {
            const lang = info ? state.sliceDoc(info.from, info.to).trim() : "";
            const deco = Decoration.replace({
              widget: new CodeLangWidget(lang, marks[0].to, firstLine.to),
            }).range(firstLine.from, firstLine.to);
            decos.push(deco);
            atomics.push(deco);
          }
          if (marks.length >= 2) {
            const lastLine = state.doc.lineAt(marks[marks.length - 1].from);
            if (
              lastLine.number !== firstLine.number &&
              lastLine.from < lastLine.to &&
              !caretTouches(caret, lastLine.from, lastLine.to) &&
              !selectionTouches(state, lastLine.from, lastLine.to)
            ) {
              const deco = Decoration.replace({}).range(lastLine.from, lastLine.to);
              decos.push(deco);
              atomics.push(deco);
            }
          }
          return;
        }
        if (name === "ListMark") {
          const listType = node.node.parent?.parent?.name;
          if (listType === "OrderedList") {
            // 数字保留原文可编辑，只弱化成等宽编号
            decos.push(Decoration.mark({ class: "cm-lp-olnum" }).range(node.from, node.to));
            return;
          }
          if (listType !== "BulletList" || caretTouches(caret, node.from, node.to)) return;
          if (/^ \[[ xX]\]/.test(state.sliceDoc(node.to, node.to + 4))) {
            hide(node.from, node.to + 1); // 任务项只留 checkbox
          } else {
            // 嵌套深度决定圆点形态（实心/空心/方点循环），与 Notion 的层级语汇一致
            let depth = 0;
            for (let p = node.node.parent; p; p = p.parent)
              if (p.name === "BulletList" || p.name === "OrderedList") depth++;
            const level = ((depth - 1) % 3) + 1;
            decos.push(
              Decoration.replace({ widget: new BulletWidget(level) }).range(node.from, node.to)
            );
          }
          return;
        }
        if (name === "TaskMarker") {
          if (!caretTouches(caret, node.from, node.to)) {
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
  return {
    decorations: Decoration.set(decos, true),
    atomics: Decoration.set(atomics, true),
  };
}

/** 光标是否落在围栏代码块内（含两侧边界行）：深色终端卡里墨色光标会隐身，
    要换成浅色实心光标。光标层是绝对定位的独立图层，CSS 选不到“代码块里的光标”，
    只能由插件在编辑器根元素上打标记类 */
function caretInFencedCode(state: EditorState): boolean {
  const pos = state.selection.main.head;
  for (const side of [-1, 1] as const) {
    let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side);
    for (; n; n = n.parent) if (n.name === "FencedCode") return true;
  }
  return false;
}

const caretInCodePlugin = ViewPlugin.fromClass(
  class {
    private last = false;
    constructor(readonly view: EditorView) {
      this.apply(caretInFencedCode(view.state));
    }
    update(update: ViewUpdate) {
      if (update.selectionSet || update.docChanged) {
        const now = caretInFencedCode(update.state);
        if (now !== this.last) this.apply(now);
      }
    }
    /** DOM 类的写入放进 measure 的写阶段，避开 update 周期内改 DOM 的限制 */
    private apply(on: boolean) {
      this.last = on;
      const dom = this.view.dom;
      this.view.requestMeasure({
        read: () => null,
        write: () => dom.classList.toggle("cm-caret-in-code", on),
      });
    }
    destroy() {
      this.view.dom.classList.remove("cm-caret-in-code");
    }
  }
);

/** 用轻量 effect 触发一次装饰重算（鼠标点击结束并收回为单光标时使用）。 */
const refreshLivePreview = StateEffect.define<null>();

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomics: DecorationSet;
    private caret: number[];
    private selectingWithMouse = false;
    private removeMouseListeners: (() => void) | null = null;

    constructor(view: EditorView) {
      this.caret = caretPositions(view.state);
      const built = buildDecorations(view, this.caret);
      this.decorations = built.decorations;
      this.atomics = built.atomics;
    }

    update(update: ViewUpdate) {
      const forced = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(refreshLivePreview))
      );

      // 文档变化会让旧位置失效；单光标移动则切换需要还原源码的语法节点。
      if (
        update.docChanged ||
        (update.selectionSet && !this.selectingWithMouse && !hasTextSelection(update.state))
      ) {
        this.caret = caretPositions(update.state);
      }

      // 鼠标拖选期间不因 selectionSet 重建装饰（布局冻结，避免拖选中途跳动）；
      // 键盘扩选/全选也要重建：选区扫到围栏行时得现出被隐藏的 ``` 原文。
      // viewport 变化仍按冻结的光标位置补齐新进入视口的装饰。
      const selectionNeedsRebuild = update.selectionSet && !this.selectingWithMouse;
      if (update.docChanged || update.viewportChanged || selectionNeedsRebuild || forced) {
        const built = buildDecorations(update.view, this.caret);
        this.decorations = built.decorations;
        this.atomics = built.atomics;
      }
    }

    beginMouseSelection(view: EditorView) {
      if (this.selectingWithMouse) return;
      const win = view.dom.ownerDocument.defaultView;
      if (!win) return;

      this.selectingWithMouse = true;
      const finish = () => this.finishMouseSelection(view);
      win.addEventListener("mouseup", finish, true);
      win.addEventListener("blur", finish, true);
      this.removeMouseListeners = () => {
        win.removeEventListener("mouseup", finish, true);
        win.removeEventListener("blur", finish, true);
      };
    }

    private finishMouseSelection(view: EditorView) {
      if (!this.selectingWithMouse) return;
      this.selectingWithMouse = false;
      this.removeMouseListeners?.();
      this.removeMouseListeners = null;

      // 单击定位光标后再按节点还原；拖选/双击结束时同样重算一次，
      // 让选区覆盖到的围栏行现出原文（拖选过程中仍冻结布局）。
      // 光标位置只在空选区时更新：留住选择前的还原状态，选完不跳动。
      if (!hasTextSelection(view.state)) this.caret = caretPositions(view.state);
      view.dispatch({ effects: refreshLivePreview.of(null) });
    }

    destroy() {
      this.removeMouseListeners?.();
      this.removeMouseListeners = null;
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(event, view) {
        const target = event.target as Element | null;
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          target?.closest?.(".cm-lp-checkbox")
        ) {
          return;
        }
        this.beginMouseSelection(view);
      },
    },
  }
);

export const livePreview: Extension = [
  livePreviewPlugin,
  caretInCodePlugin,
  // 图片/分割线按整体跳过：上下键路过时光标停在两侧边界，部件不还原、不跳动
  EditorView.atomicRanges.of((view) => view.plugin(livePreviewPlugin)?.atomics ?? RangeSet.empty),
  EditorView.editorAttributes.of({ class: "cm-live-preview" }),
  EditorView.domEventHandlers({
    mousedown: (e) => {
      // 链接点击即打开；⌥+点击放行给 CodeMirror 定位光标（还原源码可编辑）
      if (e.button !== 0 || e.altKey) return false;
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
