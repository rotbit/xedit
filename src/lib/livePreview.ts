import { syntaxTree } from "@codemirror/language";
import { RangeSet, type Extension } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { BulletWidget, CheckboxWidget } from "@/lib/livePreviewWidgets";
import {
  caretInFencedCode,
  caretPositions,
  caretTouches,
  createLpContext,
  hasTextSelection,
  inCodeRanges,
  refreshLivePreview,
  type LpContext,
} from "@/lib/livePreviewContext";
import { INLINE_NODE_NAMES, inlineDecorations } from "@/lib/livePreviewInline";
import { fencedCodeDecorations } from "@/lib/livePreviewFence";
import { fenceKeymap } from "@/lib/livePreviewFenceKeys";
import { livePreviewBlocks, renderedBlockRanges } from "@/lib/livePreviewBlocks";

/**
 * 即时渲染（类 Obsidian Live Preview）——节点级还原策略：
 * 隐藏语法标记、行内渲染图片/引用/任务清单，但还原粒度是「语法节点」而非「整行」，
 * 保证光标的被动移动（上下键路过、点击定位）不引起正文位移：
 * - 行内标记（**、`、~~、链接）：光标进入该语法范围内才显示标记，位移只发生在焦点处
 * - 行首标记（#、>）：光标不在该行时完全不占位；在该行时以零宽悬挂盒挂到正文左缘之外，
 *   两种状态下正文左缘都不动
 * - 图片/分割线/表格/公式：atomicRanges 让光标只停在两侧，路过不还原；点击部件才展开源码
 *
 * 跨行替换（表格、$$ 公式）不在这个插件里 —— CodeMirror 禁止插件提供跨行 replace，
 * 见 livePreviewBlocks.ts 的状态字段。
 */

/** 行首标记（#、>）连同其后空格：不在焦点行时整段隐藏，在焦点行时淡灰缩小显示 */
function headMark(ctx: LpContext, from: number, to: number) {
  const end = ctx.state.sliceDoc(to, to + 1) === " " ? to + 1 : to;
  if (from >= end) return;
  if (ctx.lineActive(from)) {
    ctx.decos.push(Decoration.mark({ class: "cm-lp-mark" }).range(from, end));
  } else {
    ctx.hide(from, end);
  }
}

/** 空行保持统一高度，包括光标所在行；移动光标不能推动后面的正文。 */
function scanBlankLines(ctx: LpContext, view: EditorView) {
  const { state } = ctx;
  const blocks = renderedBlockRanges(state);
  for (const range of view.visibleRanges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) {
      const line = state.doc.line(n);
      if (line.length !== 0) continue;
      // 代码块里的空行是代码的一部分；被块级部件替换掉的行压根不显示
      if (inCodeRanges(ctx.codeRanges, line.from) || inCodeRanges(blocks, line.from)) continue;
      ctx.lineClass(line.from, "cm-lp-blank");
    }
  }
}

interface Built {
  decorations: DecorationSet;
  /** 图片/分割线的替换范围：光标移动按整体跳过，不落入内部 */
  atomics: DecorationSet;
}

function buildDecorations(view: EditorView, caret: number[]): Built {
  const { state } = view;
  const ctx = createLpContext(state, caret);

  for (const range of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        const { name } = node;
        if (INLINE_NODE_NAMES.has(name)) return inlineDecorations(ctx, node);

        if (/^ATXHeading[1-6]$/.test(name)) {
          // 标题行级样式（层级字号、块级呼吸空间）——静态类，不随光标变化
          const level = Math.min(4, Number(name.slice(-1)));
          const line = state.doc.lineAt(node.from);
          ctx.lineClass(line.from, `cm-lp-h${level}`);
          // 文档第一行是标题时上方没有正文可拉开，留白改成固定值（见 cm-lp-first），
          // 让标题输入框到正文 H1 正好是 16px
          if (line.number === 1) ctx.lineClass(line.from, "cm-lp-first");
          const mark = node.node.getChild("HeaderMark");
          if (mark) headMark(ctx, mark.from, mark.to);
          return;
        }
        if (name === "SetextHeading1" || name === "SetextHeading2") {
          const line = state.doc.lineAt(node.from);
          ctx.lineClass(line.from, name === "SetextHeading1" ? "cm-lp-h1" : "cm-lp-h2");
          if (line.number === 1) ctx.lineClass(line.from, "cm-lp-first");
          for (const m of node.node.getChildren("HeaderMark")) headMark(ctx, m.from, m.to);
          return;
        }
        if (name === "Blockquote") {
          ctx.eachLine(node.from, node.to, () => "cm-lp-quote");
          return;
        }
        if (name === "QuoteMark") {
          headMark(ctx, node.from, node.to);
          return;
        }
        if (name === "ListItem") {
          // 列表行距比正文紧一档：条目本来就短，按正文行距排会散
          ctx.eachLine(node.from, node.to, () => "cm-lp-li");
          return;
        }
        if (name === "FencedCode") {
          fencedCodeDecorations(ctx, node);
          return;
        }
        if (name === "ListMark") {
          const listType = node.node.parent?.parent?.name;
          if (listType === "OrderedList") {
            // 数字保留原文可编辑，只弱化成等宽编号
            ctx.decos.push(Decoration.mark({ class: "cm-lp-olnum" }).range(node.from, node.to));
            return;
          }
          if (listType !== "BulletList" || caretTouches(caret, node.from, node.to)) return;
          if (/^ \[[ xX]\]/.test(state.sliceDoc(node.to, node.to + 4))) {
            ctx.hide(node.from, node.to + 1); // 任务项只留 checkbox
          } else {
            // 嵌套深度决定圆点形态（实心/空心/方点循环），与 Notion 的层级语汇一致
            let depth = 0;
            for (let p = node.node.parent; p; p = p.parent)
              if (p.name === "BulletList" || p.name === "OrderedList") depth++;
            const level = ((depth - 1) % 3) + 1;
            ctx.decos.push(
              Decoration.replace({ widget: new BulletWidget(level) }).range(node.from, node.to)
            );
          }
          return;
        }
        if (name === "TaskMarker") {
          if (!caretTouches(caret, node.from, node.to)) {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to));
            ctx.decos.push(
              Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to)
            );
          }
          return;
        }
      },
    });
  }

  scanBlankLines(ctx, view);

  return {
    decorations: Decoration.set(ctx.decos, true),
    atomics: Decoration.set(ctx.atomics, true),
  };
}

/** 深色终端卡里墨色光标会隐身，要换成浅色实心光标；光标层是绝对定位的独立图层，
    CSS 选不到“代码块里的光标”，只能在编辑器根元素上打标记类。
    而根元素的标记类必须走 editorAttributes，不能手动 classList：CodeMirror 同步根元素属性时
    是整串 setAttribute("class")，别处任何一次属性重算（比如选区状态类切换）都会把手动加的类
    抹掉 —— 光标进代码块后“消失”就是这么来的：类被抹，墨色光标隐进炭黑卡里 */
const caretInCodeAttr = EditorView.editorAttributes.compute(["selection", "doc"], (state) => ({
  class: caretInFencedCode(state) ? "cm-caret-in-code" : "",
}));

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
  caretInCodeAttr,
  livePreviewBlocks,
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
  // 围栏代码块的删除键接管：开栏/闭栏行是 atomic 的，默认删除会把 ``` 删穿
  fenceKeymap,
];
