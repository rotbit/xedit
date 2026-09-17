import type { SyntaxNode } from "@lezer/common";
import type { EditorState, Text } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";
import { blockGuardRanges } from "@/lib/livePreview/blocks";
import { caretTouches, type LpContext } from "@/lib/livePreview/context";
import type { ScanGuards, ScanLine } from "@/lib/livePreview/lineScan";

/**
 * 脚注的即时渲染：正文里的引用 `[^id]` 与文末的定义行 `[^id]: 内容`。
 *
 * 识别口径对着 markdown-it-footnote（renderer.ts 注册的就是它）：
 * - 标签非空、不含空格；定义行缩进不超过 3 格，`]` 后必须紧跟 `:`；
 * - 引用只有在文档里真有同名定义时才成立（插件的 footnote_ref 要查 env.footnotes.refs，
 *   查不到就按普通文字输出）。所以这里也一样：没定义的 `[^x]` 原样留着源码，
 *   免得编辑器里已经排成上标、导出却还是四个方括号字符。
 *
 * 两处要和链接分支打配合（见 inline.ts / index.ts 的接线）：lezer 不认脚注，
 * `[^id]` 会被解析成一个没有 URL 的 Link，定义行内容不含空格时整行还会被解析成
 * LinkReference（内容成了 URL 节点，不拦的话会被当成裸链接上色）。两边都装饰就会在
 * 同一段上叠出两条 replace —— 重叠的替换装饰 CodeMirror 直接抛错。
 */

/** 定义行：行首（缩进 ≤3 格）的 `[^id]:`。与 markdown-it-footnote 的 footnote_def 同口径 */
const DEF_LINE = /^ {0,3}\[\^([^\s\]]+)\]:/;
/** 引用：整个节点恰好是 `[^id]`（后面跟着 `(` 或 `[` 的那是普通链接，节点会更长） */
const REF_TEXT = /^\[\^([^\s\]]+)\]$/;

/** 光标碰到时现出的 `[^` 与 `]`，与 inline.ts 的行内标记共用一套淡化样式 */
const FN_MARK = Decoration.mark({ class: "cm-lp-mark-inline" });
/** 引用渲染态：上标、强调色、略小字号 */
const REF_MARK = Decoration.mark({ class: "cm-lp-fn-ref" });

/**
 * 全文的定义标签集合。按 doc 缓存：CodeMirror 的 Text 不可变，同一份文档里光标怎么动
 * 都复用同一份结果，只有真改了字才重算。
 * 也只有在可见范围里真出现 `[^id]` 形态时才会被调用（见 footnoteRef），
 * 没写脚注的文档一次都不扫。
 */
const labelCache = new WeakMap<Text, Set<string>>();

function footnoteLabels(state: EditorState): Set<string> {
  const cached = labelCache.get(state.doc);
  if (cached) return cached;
  const labels = new Set<string>();
  const skip = blockGuardRanges(state);
  let pos = 0;
  for (const text of state.doc.iterLines()) {
    // includes 先挡一道：长文里绝大多数行连 `[^` 都没有，不必跑正则
    if (text.includes("[^")) {
      const match = text.match(DEF_LINE);
      // 代码块/表格里的 `[^x]:` 不是定义，导出时也不是
      if (match && !skip.some((r) => pos >= r.from && pos <= r.to)) labels.add(match[1]);
    }
    pos += text.length + 1;
  }
  labelCache.set(state.doc, labels);
  return labels;
}

/** 这一行是不是脚注定义行（行首标签由 footnoteDefLine 处理，整行不再走链接那套） */
export function isFootnoteDefLine(state: EditorState, pos: number): boolean {
  return DEF_LINE.test(state.doc.lineAt(pos).text);
}

/**
 * 定义行行首的 `[^id]:`：光标/选区不在本行时缩成一枚小号弱化的 `id.`。
 * 用部件而不是隐藏原文，是因为渲染态要多出一个点（`1.` 读作条目的序号），
 * 源码里并没有这个字符。
 */
class FootnoteDefWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(other: FootnoteDefWidget) {
    return other.label === this.label;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-lp-fn-def";
    el.textContent = `${this.label}.`;
    return el;
  }
  ignoreEvent() {
    // 点它要能把光标放回标签处改 id，事件交回 CodeMirror 自己定位
    return false;
  }
}

/**
 * 正文里的引用 `[^id]`。返回 true 表示这处已由脚注接管，链接分支必须就此收手。
 *
 * 三种情况都算接管：正常渲染、光标碰到现出源码、以及「形态对但没有定义」——
 * 最后一种什么都不画，就是要让 `[^1]` 四个字符原样留着。若交回链接分支，
 * 它会把 `[` 和 `]` 藏掉、只剩一个孤零零的 `^1`，那是个谁都看不懂的形态。
 */
export function footnoteRef(ctx: LpContext, node: SyntaxNode): boolean {
  const { state } = ctx;
  const match = state.sliceDoc(node.from, node.to).match(REF_TEXT);
  if (!match) return false;
  const line = state.doc.lineAt(node.from);
  // 定义行行首那个 `[^id]` 不是引用（它连着后面的 `:` 一起换成小号标签）
  if (isFootnoteDefLine(state, node.from) && node.from - line.from === line.text.indexOf("[")) {
    return true;
  }
  if (!footnoteLabels(state).has(match[1])) return true;
  if (caretTouches(ctx.caret, node.from, node.to)) {
    ctx.decos.push(FN_MARK.range(node.from, node.from + 2), FN_MARK.range(node.to - 1, node.to));
    return true;
  }
  ctx.hide(node.from, node.from + 2);
  ctx.hide(node.to - 1, node.to);
  ctx.decos.push(REF_MARK.range(node.from + 2, node.to - 1));
  return true;
}

/**
 * 定义行 `[^id]: 内容`：行首标签换成小号的 `id.`，内容照常渲染。
 * 还原判定用 lineActive（光标或选区落在本行）——这是个行首标记，与 `#`、`>` 同一档，
 * 而不是跟着光标走的行内元素。
 */
export function footnoteDefLine(ctx: LpContext, line: ScanLine, guards: ScanGuards): void {
  const match = line.text.match(DEF_LINE);
  if (!match) return;
  const from = line.from + match[0].indexOf("[");
  const to = line.from + match[0].length;
  if (guards.inBlock(from, to)) return;
  // 标签里写了公式（`[^$x$]:` 这种怪写法）时公式已经先占了这一段：
  // 两条 replace 叠在一起 CodeMirror 直接抛错，让给公式，标签保持源码
  if (ctx.mathRanges.some((r) => from < r.to && to > r.from)) return;
  if (ctx.lineActive(line.from)) return;
  ctx.decos.push(Decoration.replace({ widget: new FootnoteDefWidget(match[1]) }).range(from, to));
}
