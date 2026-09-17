import { syntaxTree } from "@codemirror/language";
import { RangeSet, type EditorState, type Extension } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { BulletWidget, CalloutBadgeWidget, CheckboxWidget } from "@/lib/livePreview/widgets";
import { calloutStyle, parseCalloutHead } from "@/lib/callout";
import { ATTACHMENTS_RESOLVED_EVENT } from "@/lib/localBackend/attachmentUrls";
import {
  caretAtStartOrInside,
  caretInFencedCode,
  caretPositions,
  caretTouches,
  createLpContext,
  hasTextSelection,
  inCodeRanges,
  refreshLivePreview,
  type LpContext,
} from "@/lib/livePreview/context";
import { INLINE_NODE_NAMES, inlineDecorations, linkTargetAt } from "@/lib/livePreview/inline";
import { scanVisibleLines } from "@/lib/livePreview/lineScan";
import { inlineMathLine } from "@/lib/livePreview/inlineMath";
import { footnoteDefLine, isFootnoteDefLine } from "@/lib/livePreview/footnote";
import { fencedCodeDecorations } from "@/lib/livePreview/fence";
import { fenceKeymap } from "@/lib/livePreview/fenceKeys";
import { livePreviewBlocks, renderedBlockRanges } from "@/lib/livePreview/blocks";
import { colorSpanKeys } from "@/lib/editor/colorSpanKeys";
import { requestOpenWikiLink } from "@/lib/wikiLink";

/**
 * 即时渲染（类 Obsidian Live Preview）——节点级还原策略：
 * 隐藏语法标记、行内渲染图片/引用/任务清单，但还原粒度是「语法节点」而非「整行」，
 * 保证光标的被动移动（上下键路过、点击定位）不引起正文位移：
 * - 行内标记（**、`、~~、链接）：光标进入该语法范围内才显示标记，位移只发生在焦点处
 * - 行首标记（#、>）：光标不在该行时完全不占位；在该行时以零宽悬挂盒挂到正文左缘之外，
 *   两种状态下正文左缘都不动
 * - 整体部件（图片/视频/分割线/表格/公式）：光标一碰到两侧边界就展开源码（点击部件、
 *   上下键路过都算），碰不到时 atomicRanges 让光标整体跳过；图片展开时源码原样显示、
 *   图片改挂到源码下方 —— 整张图消失版面会塌一块（见 inline.ts 的 Image 分支）。
 *   一律只认光标不认横扫而过的选区：⌘A/拖选要是把全篇部件都炸成源码，版面会整个跳一次
 * - 任务清单：`- ` 始终隐藏、`[ ]` 只在光标进到记号里才现出，Home/← 走到行首零位移
 *
 * 跨行替换（表格、$$ 公式）不在这个插件里 —— CodeMirror 禁止插件提供跨行 replace，
 * 见 blocks.ts 的状态字段。
 */

/** 行首标记（#、>）连同其后空格：不在焦点行时整段隐藏，在焦点行时淡灰缩小显示 */
function headMark(ctx: LpContext, from: number, to: number) {
  const end = ctx.state.sliceDoc(to, to + 1) === " " ? to + 1 : to;
  if (from >= end) return;
  if (ctx.lineActive(from)) {
    // 盒宽按字符数定死（等宽字体），CSS 据此用负 margin 把整段挂到正文左缘之外
    ctx.decos.push(
      Decoration.mark({
        class: "cm-lp-mark",
        attributes: { style: `--lp-mark:${end - from}ch` },
      }).range(from, end)
    );
  } else {
    ctx.hide(from, end);
  }
}

/** 列表条目首行的前缀装饰：
 *  - 每个祖先条目的缩进段打 cm-lp-indent，按字符数定宽（N ch），并记下起始列 --lp-col，
 *    CSS 据此把引导竖线画在祖先圆点正下方；
 *  - 圆点后的那个空格打 cm-lp-gap（1ch 定宽），前缀总宽度于是恰为「前缀字符数 × 1ch」；
 *  - 行级 cm-lp-hang 记下前缀宽度 --lp-hang，CSS 用它做悬挂缩进，续行与正文左缘对齐。
 *  同一行里既有外层标记又有内层标记（如 "- - a"）时前缀不是纯空白，整套都不做。 */
function listPrefix(ctx: LpContext, state: EditorState, item: SyntaxNode) {
  const mark = item.getChild("ListMark");
  if (!mark) return;
  const line = state.doc.lineAt(mark.from);
  if (!/^\s*$/.test(state.sliceDoc(line.from, mark.from))) return;
  const ownCol = mark.from - line.from;
  const cols: number[] = [];
  for (let p = item.parent; p; p = p.parent) {
    if (p.name !== "ListItem") continue;
    const pm = p.getChild("ListMark");
    if (pm) cols.push(pm.from - state.doc.lineAt(pm.from).from);
  }
  cols.sort((a, b) => a - b);
  cols.forEach((from, i) => {
    const to = cols[i + 1] ?? ownCol;
    if (to <= from) return;
    ctx.decos.push(
      Decoration.mark({
        class: "cm-lp-indent",
        attributes: { style: `--lp-col:${from};min-width:${to - from}ch` },
      }).range(line.from + from, line.from + to)
    );
  });
  const task = /^ \[[ xX]\]/.test(state.sliceDoc(mark.to, mark.to + 4));
  const hasGap = !task && state.sliceDoc(mark.to, mark.to + 1) === " ";
  if (hasGap) {
    ctx.decos.push(Decoration.mark({ class: "cm-lp-gap" }).range(mark.to, mark.to + 1));
  }
  // 任务项的 "- " 会被整段隐藏、复选框宽度不是 ch 的整数倍，续行只对齐到缩进处
  const hang = task ? ownCol : mark.to - line.from + (hasGap ? 1 : 0);
  if (hang > 0) {
    ctx.decos.push(
      Decoration.line({ class: "cm-lp-hang", attributes: { style: `--lp-hang:${hang}ch` } }).range(
        line.from
      )
    );
  }
}

/**
 * 提示块（`> [!tip] 标题`）：整块按类型着色，首行的 `[!tip]` 记号换成类型徽标。
 * 命中返回 true，调用方据此跳过普通引用的处理；QuoteMark 分支不受影响，
 * 每行的 `>` 照旧由 headMark 收走。
 */
function calloutDecorations(ctx: LpContext, from: number, to: number): boolean {
  const { state } = ctx;
  const line = state.doc.lineAt(from);
  // 从 `>` 切到行尾再剥掉一层记号：嵌套引用（`> > [!tip]`）里只有内层节点能命中，
  // 外层剥掉一个 `>` 之后仍以 `>` 开头，自然落回普通引用
  const rest = state.sliceDoc(from, line.to);
  const quote = /^>[ \t]?/.exec(rest);
  if (!quote) return false;
  const head = parseCalloutHead(rest.slice(quote[0].length));
  if (!head) return false;

  ctx.eachLine(from, to, () => `cm-lp-quote cm-lp-callout cm-lp-callout-${head.type}`);

  const markFrom = from + quote[0].length;
  const markTo = markFrom + head.markEnd;
  // 自定义标题只加粗、不替换：字形宽度不随光标进出变化，首行不会跳动
  if (head.custom) {
    let titleStart = quote[0].length + head.markEnd;
    while (titleStart < rest.length && (rest[titleStart] === " " || rest[titleStart] === "\t")) {
      titleStart++;
    }
    if (from + titleStart < line.to) {
      ctx.decos.push(
        Decoration.mark({ class: "cm-lp-callout-title" }).range(from + titleStart, line.to)
      );
    }
  }
  // 光标或选区落在首行时不替换：与行首记号（#、>）同一套规矩，要改类型总得先看见源码
  if (!ctx.lineActive(line.from)) {
    ctx.decos.push(
      Decoration.replace({
        widget: new CalloutBadgeWidget(calloutStyle(head.type).title),
      }).range(markFrom, markTo)
    );
  }
  return true;
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
  /** 此刻以部件形态渲染的替换范围（图片/视频/分割线/围栏行）：光标移动按整体跳过，不落入内部 */
  atomics: DecorationSet;
}

function buildDecorations(view: EditorView, caret: number[]): Built {
  const { state } = view;
  const ctx = createLpContext(state, caret);

  // 按原文逐行扫的两样东西先做：行内公式 `$…$`（lezer 不认 `$`）与脚注定义行。
  // 公式必须排在语法树那一趟之前——扫出来的区间要先登记到 ctx，
  // 里面的 `*`、`[` 才不会被当成 Markdown 标记再藏一次（见 context.ts 的 inMath）
  scanVisibleLines(view, (line, guards) => {
    inlineMathLine(ctx, view, line, guards);
    footnoteDefLine(ctx, line, guards);
  });

  for (const range of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        const { name } = node;
        // 脚注定义行 `[^id]: 内容`，内容不含空格时会被 lezer 整行当成链接引用定义，
        // 内容还成了 URL 节点。整棵子树跳过：行首标签已由 footnoteDefLine 换成小标签，
        // 再进去只会把正文染成一条点不开的假链接
        if (name === "LinkReference" && isFootnoteDefLine(state, node.from)) return false;
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
        // 下划线式的 Setext 标题不必处理：markdown 扩展已 remove: ["SetextHeading"]
        // （见 src/lib/editor/extensions.ts），语法树里压根不会出现这两个节点
        if (name === "Blockquote") {
          if (calloutDecorations(ctx, node.from, node.to)) return;
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
          listPrefix(ctx, state, node.node);
          return;
        }
        if (name === "FencedCode") {
          fencedCodeDecorations(ctx, node);
          return;
        }
        if (name === "ListMark") {
          const listType = node.node.parent?.parent?.name;
          if (listType === "OrderedList") {
            // 数字保留原文可编辑，只弱化成等宽编号；盒宽按字符数定死，前缀宽度可精确推算
            ctx.decos.push(
              Decoration.mark({
                class: "cm-lp-olnum",
                attributes: { style: `min-width:${node.to - node.from}ch` },
              }).range(node.from, node.to)
            );
            return;
          }
          if (listType !== "BulletList") return;
          if (/^ \[[ xX]\]/.test(state.sliceDoc(node.to, node.to + 4))) {
            // 任务项的 "- " 一律整段隐藏，光标停在行首/"-"后/"["前也不现出：复选框顶替的是
            // "[ ]"，"- " 在渲染形态里没有对应物，一现出就是净 2ch 的位移——按 Home 回行首
            // 整行往右挪两格正是这么来的。这三个位置的光标本就都画在行首同一点，看不出区别；
            // 记号照常可删可改，改到不再是任务项时整行会落回源码，反馈是看得见的
            ctx.hide(node.from, node.to + 1);
            return;
          }
          if (caretTouches(caret, node.from, node.to)) {
            // 光标在本行时露出原始 "-"，也占 1ch（与圆点同宽），光标进出行时正文零位移
            ctx.decos.push(Decoration.mark({ class: "cm-lp-rawmark" }).range(node.from, node.to));
            return;
          }
          // 嵌套深度决定圆点形态（实心/空心/方点循环），与 Notion 的层级语汇一致
          let depth = 0;
          for (let p = node.node.parent; p; p = p.parent)
            if (p.name === "BulletList" || p.name === "OrderedList") depth++;
          const level = ((depth - 1) % 3) + 1;
          ctx.decos.push(
            Decoration.replace({ widget: new BulletWidget(level) }).range(node.from, node.to)
          );
          return;
        }
        if (name === "TaskMarker") {
          // 左闭右开（caretAtStartOrInside）：光标停在 `]` 之后仍显示复选框——那是从正文
          // 首字按 ← 过来的落点，也是最常停的位置，含右边界的话一按左键复选框就翻成
          // `[x]` 文字、整行跟着跳。落在 `[` 之前或方括号内部才现出源码，那是有意进记号里改
          if (!caretAtStartOrInside(caret, node.from, node.to)) {
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

/**
 * 解冻拖选布局的信号。mouseup 之外还要多几道保险：拖到窗口外松手、拖到一半切走应用，
 * mouseup 根本不会派到这个窗口，冻结标志就永远留着——此后所有光标移动都不再重建装饰，
 * 整个即时渲染像是“卡住了”。blur（含捕获阶段的元素失焦）、下一次 pointerdown
 * （规范里先于 mousedown，所以不会误伤本次手势）、下一次 keydown 各补一刀。
 */
const SELECTION_END_EVENTS = ["mouseup", "blur", "pointerdown", "keydown"] as const;

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
      for (const type of SELECTION_END_EVENTS) win.addEventListener(type, finish, true);
      this.removeMouseListeners = () => {
        for (const type of SELECTION_END_EVENTS) win.removeEventListener(type, finish, true);
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

/**
 * 本地文库的附件图片是异步读出来的：读到一批就空转一次事务，
 * 装饰重建时图片部件拿到新的 object URL（src 变了 eq 不成立，部件随之重建）。
 */
const attachmentRefresh = ViewPlugin.define((view) => {
  const onResolved = () => view.dispatch({ effects: refreshLivePreview.of(null) });
  window.addEventListener(ATTACHMENTS_RESOLVED_EVENT, onResolved);
  return {
    destroy() {
      window.removeEventListener(ATTACHMENTS_RESOLVED_EVENT, onResolved);
    },
  };
});

export const livePreview: Extension = [
  livePreviewPlugin,
  attachmentRefresh,
  caretInCodeAttr,
  livePreviewBlocks,
  // 部件按整体跳过：上下键路过时光标停在两侧边界，不会落进被替换掉的源码里。
  // 登记的只有此刻真以部件形态渲染的区间——光标贴上来把源码展开之后，这一段就不再 atomic，
  // 删除键于是按字符走（退一次只掉一个 `-`，而不是整条分割线无声消失）
  EditorView.atomicRanges.of((view) => view.plugin(livePreviewPlugin)?.atomics ?? RangeSet.empty),
  EditorView.editorAttributes.of({ class: "cm-live-preview" }),
  EditorView.domEventHandlers({
    // 修饰键按着点链接：先把 mousedown 截下来，否则 CodeMirror 已经把光标放进链接里
    // （源码当场炸开、⌘ 还可能多加一个光标），等 click 再打开时版面已经跳过一次
    mousedown: (e) => {
      if (!linkTargetAt(e)) return false;
      e.preventDefault();
      return true;
    },
    // 打开动作放在 click 而不是 mousedown：从链接文字起手拖选时只有 mousedown，
    // 松手前浏览器不会派 click，拖选于是绝不会误跳转
    click: (e) => {
      const target = linkTargetAt(e);
      if (!target) return false;
      if (target.wiki) requestOpenWikiLink(target.wiki);
      // noopener 必须给：新窗口能通过 opener 反向操纵本页
      else if (target.href) window.open(target.href, "_blank", "noopener");
      e.preventDefault();
      return true;
    },
  }),
  // 围栏代码块的删除键接管：开栏/闭栏行是 atomic 的，默认删除会把 ``` 删穿
  fenceKeymap,
  // 颜色 span 同理：首尾标签常隐且 atomic，删除键要跳过它们，被删剩一半时还要收拾孤儿
  colorSpanKeys,
];
