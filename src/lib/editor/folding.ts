/**
 * 标题折叠（H1–H4）：标题行首挂一枚小三角，折起来的段落在行尾留一枚 "…" 药丸。
 *
 * 折叠范围不自己算。@codemirror/lang-markdown 的 markdown() 里已经装了一个
 * headerIndent（foldService，见 node_modules/@codemirror/lang-markdown/dist/index.js），
 * 范围正是「标题行行尾 → 下一个同级/更高级标题之前最后一个块节点的末尾」：
 * - 段落之间的空行不属于任何块节点，天然被排到折叠范围之外，折起来之后下一个标题
 *   不会贴上来，章节之间的呼吸感还在；
 * - 围栏代码块里的 `#` 在语法树里是 CodeText 不是标题，不会被误当成分界。
 * 所以这里只调 foldable()，不重复造一个 foldService。
 *
 * 入口做成行首 widget 而不是 gutter：这版编辑器是所见即所得的版式，正文列居中、
 * 左右留白很大，加一条 gutter 会把「文档」重新变回「代码编辑器」。widget 的锚点
 * 零宽零高，三角绝对定位挂到正文左缘之外，行内排版与光标位置的计算都感觉不到它。
 * 样式见 app/editor.css。
 */

import {
  EditorSelection,
  type EditorState,
  type Extension,
  type Line,
  type Range,
} from "@codemirror/state";
import {
  codeFolding,
  foldEffect,
  foldKeymap,
  foldable,
  foldedRanges,
  syntaxTree,
  unfoldEffect,
} from "@codemirror/language";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type KeyBinding,
  type ViewUpdate,
} from "@codemirror/view";

/** 只给 H1–H4 挂把手：H5/H6 在版式里已经退回正文字号（见 live-preview.css 的 cm-lp-h4），
    再多一个把手只是噪点；它们仍然能用快捷键折叠，foldable() 对六级标题一视同仁 */
const FOLDABLE_HEADING = /^ATXHeading[1-4]$/;

const SVG_NS = "http://www.w3.org/2000/svg";

interface FoldRange {
  from: number;
  to: number;
}

/** 折叠区间总是从标题行行尾起头，所以「这个标题折没折」等价于「行尾有没有折叠区间」 */
function foldedAt(state: EditorState, lineEnd: number): FoldRange | null {
  const hit: FoldRange[] = [];
  foldedRanges(state).between(lineEnd, lineEnd, (from, to) => {
    if (from === lineEnd) hit.push({ from, to });
  });
  return hit[0] ?? null;
}

/**
 * 光标此刻是否被埋在某个折叠区间「内部」，是的话给出该区间的开头（即标题行行尾）。
 * 严格内部：正好停在两端不算——折完把光标放到 from 上是常规收尾，不该被当成出事。
 */
function buriedCaretTarget(state: EditorState): number | null {
  const head = state.selection.main.head;
  const starts: number[] = [];
  foldedRanges(state).between(head, head, (from, to) => {
    if (from < head && to > head) starts.push(from);
  });
  return starts.length ? Math.min(...starts) : null;
}

/**
 * 折叠命令的统一收尾：命令本身不管光标，折完可能把光标埋进折叠区里（foldAll 尤其明显，
 * 光标会当场消失）。dispatch 是同步的，命令跑完立刻看新状态，埋了就把光标挪到区间开头。
 * 这一下不会把刚折好的区间又撑开：CodeMirror 只在选区落点「严格落在折叠区内部」时
 * 自动展开（foldState 里的 clearTouchedFolds），落在边界上不算。
 */
function liftBuriedCaret(view: EditorView): void {
  const target = buriedCaretTarget(view.state);
  if (target !== null) view.dispatch({ selection: EditorSelection.cursor(target) });
}

/** 折叠/展开这一标题行；该行折不动（空章节、压根不是标题）时返回 false */
function toggleHeadingFold(view: EditorView, line: Line): boolean {
  const folded = foldedAt(view.state, line.to);
  if (folded) {
    view.dispatch({ effects: unfoldEffect.of(folded) });
    return true;
  }
  const range = foldable(view.state, line.from, line.to);
  if (!range) return false;
  view.dispatch({ effects: foldEffect.of(range) });
  liftBuriedCaret(view);
  return true;
}

/** 标题行首的折叠三角：零宽锚点 + 绝对定位的把手，两层的分工见 editor.css */
class FoldChevron extends WidgetType {
  constructor(private readonly folded: boolean) {
    super();
  }

  /** 位置由装饰自己带着，部件只需要区分展开/折叠两种形态 */
  eq(other: FoldChevron): boolean {
    return other.folded === this.folded;
  }

  toDOM(): HTMLElement {
    const anchor = document.createElement("span");
    anchor.className = "cm-fold-anchor";

    const button = document.createElement("span");
    button.className = "cm-fold-chevron";
    // 朝向与常显与否都由 CSS 按这个属性决定，JS 不碰样式
    button.dataset.folded = this.folded ? "true" : "false";
    button.title = this.folded ? "展开" : "折叠";
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", this.folded ? "展开这一节" : "折叠这一节");

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M4.5 6.5 8 10l3.5-3.5");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.75");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    button.append(svg);
    anchor.append(button);
    return anchor;
  }

  /** mousedown 必须放行：返回 true 的事件 CodeMirror 连插件的 eventHandlers 都不派发，
      下面那个折叠处理器就永远收不到点击。其余事件照旧忽略，别被当成正文操作 */
  ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown";
  }
}

/**
 * 只扫视口内的标题。side 取负是关键：Decoration.widget 会把负 side 折算成 -1e8，
 * 排在同位置一切装饰之前——尤其排在即时渲染那条隐藏 "## " 的 replace（startSide 约 +5e8）
 * 之前，于是三角落在被隐藏的记号外侧，不会被它吞掉，也不会被 cm-lp-mark 的负 margin 拖走。
 */
function buildChevrons(view: EditorView): DecorationSet {
  const { state } = view;
  const decos: Range<Decoration>[] = [];
  let lastLineFrom = -1;
  for (const range of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        if (!FOLDABLE_HEADING.test(node.name)) return;
        const line = state.doc.lineAt(node.from);
        // 视口被折叠切成几段时，同一行理论上可能被相邻两段各扫一次
        if (line.from === lastLineFrom) return;
        // 空章节（下一行就是同级或更高级标题）折不动，不该给一个按了没反应的把手
        if (!foldable(state, line.from, line.to)) return;
        lastLineFrom = line.from;
        decos.push(
          Decoration.widget({
            widget: new FoldChevron(foldedAt(state, line.to) !== null),
            side: -1,
          }).range(line.from)
        );
      },
    });
  }
  return Decoration.set(decos, true);
}

const foldChevrons = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildChevrons(view);
    }

    update(update: ViewUpdate) {
      // 折叠集合是 StateField，没变时 RangeSet.map 原样返回旧对象，比引用就够了；
      // 语法树是后台增量解析的，树换了才知道后半篇哪些行是标题（同 blocks.ts 的做法）
      const foldChanged = foldedRanges(update.startState) !== foldedRanges(update.state);
      const treeChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
      if (update.docChanged || update.viewportChanged || foldChanged || treeChanged) {
        this.decorations = buildChevrons(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(event, view) {
        const target = event.target as Element | null;
        if (event.button !== 0 || !target?.closest?.(".cm-fold-chevron")) return false;
        const lineEl = target.closest(".cm-line");
        if (!lineEl) return false;
        // 必须截下来：默认这一下会把光标挪到三角所在的行首，还会顺手改变焦点
        event.preventDefault();
        toggleHeadingFold(view, view.state.doc.lineAt(view.posAtDOM(lineEl)));
        return true;
      },
    },
  }
);

/** 折叠后留在标题行尾的 "…" 药丸（官方默认是一个灰底方块，与整站观感不搭，整块换掉） */
const foldedPlaceholder = codeFolding({
  placeholderDOM: (_view, onclick) => {
    const pill = document.createElement("span");
    pill.className = "cm-fold-pill";
    pill.textContent = "…";
    pill.title = "点击展开";
    pill.setAttribute("role", "button");
    pill.setAttribute("aria-label", "已折叠，点击展开");
    // 先按下去的话光标会落到折叠区边界、版面跟着跳一下，截掉只留 click
    pill.addEventListener("mousedown", (event) => event.preventDefault());
    pill.addEventListener("click", onclick);
    return pill;
  },
});

/**
 * 沿用官方 foldKeymap（mac：⌘⌥[ 折叠、⌘⌥] 展开；⌃⌥[ / ⌃⌥] 全部折叠/展开），
 * 与 shortcuts.ts 的 ⌘⌥0/1/2/3 不撞。每条命令后面补一次光标救援。
 */
const foldKeys: KeyBinding[] = foldKeymap.map((binding) => {
  const run = binding.run;
  if (!run) return binding;
  return {
    ...binding,
    run: (view: EditorView) => {
      if (!run(view)) return false;
      liftBuriedCaret(view);
      return true;
    },
  };
});

/**
 * 折叠状态只活在本次会话的内存里，不持久化：foldState 是个 StateField，
 * 切文档时整篇内容被替换，折叠区间跟着改动一起被删掉，自然清空。
 * 查找跳转、目录跳转都靠 dispatch selection 落点，CodeMirror 对落在折叠区内部的选区
 * 会自动展开（foldState 的 clearTouchedFolds），不用额外接线。
 */
export const headingFolding: Extension = [foldedPlaceholder, foldChevrons, keymap.of(foldKeys)];
