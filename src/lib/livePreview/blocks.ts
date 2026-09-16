import { syntaxTree } from "@codemirror/language";
import { RangeSet, StateField, type EditorState, type Extension, type Range, type Transaction } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { MathBlockWidget, TableWidget } from "@/lib/livePreview/blockWidgets";
import { FrontmatterWidget } from "@/lib/livePreview/frontmatterWidget";
import { parseFrontmatter } from "@/lib/frontmatter";
import {
  caretInside,
  caretPositions,
  inCodeRanges,
  refreshLivePreview,
  selectionTouches,
  type CodeRange,
} from "@/lib/livePreview/context";

/**
 * 块级即时渲染（表格、$$ 公式）——必须走状态字段而不是视图插件：
 * CodeMirror 明令「跨行的 replace 装饰不能由插件提供」（会抛 RangeError），
 * 而整块表格/公式天然跨行。
 *
 * 字段看不到 visibleRanges，因此缓存全文块区间，光标移动只重跑还原判定。
 * 公式分隔行使用增量索引；文档或语法树变化时再结合块级语法节点重新配对。
 */

interface BlockRange extends CodeRange {
  kind: "table" | "math" | "frontmatter";
  /** 表格与 frontmatter 用原文、公式用 TeX，作为部件的 eq 依据 */
  payload: string;
}

/** frontmatter 只可能在文首这几行；设个上限，免得把「文档以 --- 开头、很久以后又有一条 ---」
 *  的正文整段吞进卡片 */
const FRONTMATTER_MAX_LINES = 40;

/**
 * 文首 frontmatter 的区间。走文本扫描而不是语法树：Setext 标题已被关掉，
 * `---` 在语法树里就是两条各自独立的 HorizontalRule，认不出成对关系。
 * 至少要解析出一个键才算数——否则一篇以分割线开头的文章会被误判成 frontmatter。
 */
function scanFrontmatter(state: EditorState): BlockRange | null {
  if (state.doc.line(1).text.trimEnd() !== "---") return null;
  const last = Math.min(state.doc.lines, FRONTMATTER_MAX_LINES);
  for (let n = 2; n <= last; n++) {
    const line = state.doc.line(n);
    if (line.text.trimEnd() !== "---") continue;
    const source = state.sliceDoc(0, line.to);
    const parsed = parseFrontmatter(source);
    if (!parsed || Object.keys(parsed.data).length === 0) return null;
    return { kind: "frontmatter", from: 0, to: line.to, payload: source };
  }
  return null;
}

interface BlockDecorations {
  /** 本次真正被替换掉的区间：插件那边的逐行扫描要跳过（隐藏行不该再加行级类） */
  rendered: CodeRange[];
  deco: DecorationSet;
  atomics: DecorationSet;
}

interface BlockState extends BlockDecorations {
  ranges: BlockRange[];
  /** 原文中独占行的 $$ 偏移；普通输入只更新改动涉及的行。 */
  mathDelimiters: number[];
}

/** 首次装载全文建立索引；后续只扫描事务覆盖的行，避免每个按键遍历所有正文行。 */
function collectMathDelimiters(state: EditorState, from = 0, to = state.doc.length): number[] {
  const positions: number[] = [];
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to).number;
  let pos = first.from;
  for (const text of state.doc.iterLines(first.number, last + 1)) {
    if (text.trim() === "$$") positions.push(pos);
    pos += text.length + 1;
  }
  return positions;
}

function updateMathDelimiters(previous: number[], tr: Transaction): number[] {
  if (!tr.docChanged) return previous;
  const changed: { from: number; to: number }[] = [];
  const added = new Set<number>();
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    changed.push({ from: tr.startState.doc.lineAt(fromA).from, to: tr.startState.doc.lineAt(toA).to });
    for (const pos of collectMathDelimiters(tr.state, fromB, toB)) added.add(pos);
  });
  for (const pos of previous) {
    if (!changed.some((range) => pos >= range.from && pos <= range.to)) {
      added.add(tr.changes.mapPos(pos, 1));
    }
  }
  return [...added].sort((a, b) => a - b);
}

/** 将分隔行配对成公式块；代码块内部或跨越代码块的分隔符不配对。 */
function scanMathBlocks(state: EditorState, codeRanges: CodeRange[], mathDelimiters: number[]): BlockRange[] {
  const out: BlockRange[] = [];
  const doc = state.doc;
  let openFrom = -1;
  for (const from of mathDelimiters) {
    if (inCodeRanges(codeRanges, from)) {
      openFrom = -1;
      continue;
    }
    if (openFrom >= 0 && codeRanges.some((range) => range.from > openFrom && range.from < from)) openFrom = -1;
    if (openFrom < 0) {
      openFrom = from;
      continue;
    }
    const to = doc.lineAt(from).to;
    // 首尾两行是定界符，中间才是 TeX
    const tex = doc.sliceString(openFrom, to).split("\n").slice(1, -1).join("\n").trim();
    if (tex) out.push({ kind: "math", from: openFrom, to, payload: tex });
    openFrom = -1;
  }
  return out;
}

function scanBlocks(state: EditorState, mathDelimiters: number[]): BlockRange[] {
  const codeRanges: CodeRange[] = [];
  const tables: BlockRange[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "FencedCode") {
        codeRanges.push({ from: node.from, to: node.to });
        return false;
      }
      if (node.name === "Table") {
        tables.push({
          kind: "table",
          from: node.from,
          to: node.to,
          payload: state.sliceDoc(node.from, node.to),
        });
        return false;
      }
      // 行内格式不可能包含块级表格/围栏，不必逐个访问其中的强调、链接等节点。
      if (node.name === "Paragraph" || /^ATXHeading/.test(node.name)) return false;
      return undefined;
    },
  });
  const frontmatter = scanFrontmatter(state);
  return [...(frontmatter ? [frontmatter] : []), ...tables, ...scanMathBlocks(state, codeRanges, mathDelimiters)].sort(
    (a, b) => a.from - b.from
  );
}

function buildBlockDecorations(state: EditorState, ranges: BlockRange[]): BlockDecorations {
  const caret = caretPositions(state);
  const decos: Range<Decoration>[] = [];
  const rendered: CodeRange[] = [];
  for (const r of ranges) {
    // block 装饰必须整行覆盖，否则 CodeMirror 会在渲染时抛错；
    // 缩进在引用/列表里的表格拿不到整行，索性保持源码不渲染
    if (state.doc.lineAt(r.from).from !== r.from || state.doc.lineAt(r.to).to !== r.to) continue;
    if (caretInside(caret, r.from, r.to) || selectionTouches(state, r.from, r.to)) continue;
    const widget =
      r.kind === "table"
        ? new TableWidget(r.payload)
        : r.kind === "frontmatter"
          ? new FrontmatterWidget(r.payload)
          : new MathBlockWidget(r.payload);
    decos.push(Decoration.replace({ widget, block: true }).range(r.from, r.to));
    rendered.push({ from: r.from, to: r.to });
  }
  const deco = Decoration.set(decos, true);
  return { rendered, deco, atomics: deco };
}

const livePreviewBlockField = StateField.define<BlockState>({
  create(state) {
    const mathDelimiters = collectMathDelimiters(state);
    const ranges = scanBlocks(state, mathDelimiters);
    return { ranges, mathDelimiters, ...buildBlockDecorations(state, ranges) };
  },
  update(value, tr) {
    // 语法树是后台增量解析的：树换了也要重扫，否则大文档滚到后半程表格不渲染
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    const forced = tr.effects.some((e) => e.is(refreshLivePreview));
    const rescan = tr.docChanged || treeChanged;
    if (!rescan && !tr.selection && !forced) return value;
    const mathDelimiters = updateMathDelimiters(value.mathDelimiters, tr);
    const ranges = rescan ? scanBlocks(tr.state, mathDelimiters) : value.ranges;
    return { ranges, mathDelimiters, ...buildBlockDecorations(tr.state, ranges) };
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.deco),
    // 表格/公式整体跳过：上下键路过时光标停在两侧边界，部件不还原、不跳动
    EditorView.atomicRanges.of((view) => view.state.field(f, false)?.atomics ?? RangeSet.empty),
  ],
});

/** 当前被块级部件替换掉的区间，供插件的逐行扫描回避 */
export function renderedBlockRanges(state: EditorState): CodeRange[] {
  return state.field(livePreviewBlockField, false)?.rendered ?? [];
}

export const livePreviewBlocks: Extension = livePreviewBlockField;
