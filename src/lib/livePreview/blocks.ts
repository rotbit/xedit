import { syntaxTree } from "@codemirror/language";
import { RangeSet, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { MathBlockWidget, TableWidget } from "@/lib/livePreview/blockWidgets";
import { FrontmatterWidget } from "@/lib/livePreview/frontmatterWidget";
import { rescanBlocks, scanAll, type BlockRange, type BlockScan } from "@/lib/livePreview/blockScan";
import {
  caretPositions,
  caretTouches,
  hasTextSelection,
  refreshLivePreview,
  selectionInside,
  type CodeRange,
} from "@/lib/livePreview/context";

/**
 * 块级即时渲染（表格、$$ 公式、frontmatter）——必须走状态字段而不是视图插件：
 * CodeMirror 明令「跨行的 replace 装饰不能由插件提供」（会抛 RangeError），
 * 而整块表格/公式天然跨行。
 *
 * 字段看不到 visibleRanges，因此缓存全文块区间（扫描与增量见 blockScan.ts），
 * 本文件只管两件事：哪些块此刻该让位给源码，以及据此建装饰。
 */

interface BlockDecorations {
  /** 本次真正被替换掉的区间：插件那边的逐行扫描要跳过（隐藏行不该再加行级类） */
  rendered: CodeRange[];
  deco: DecorationSet;
  atomics: DecorationSet;
}

interface BlockState extends BlockDecorations, BlockScan {
  /** 与 ranges 同序：该块此刻是否以部件形态渲染。光标移动时先比这个集合，
   *  没变就直接复用上次的装饰，不必把全篇部件重建一遍 */
  shown: boolean[];
}

/**
 * 块是否以部件形态渲染（false = 现出源码）。两条判定：
 * - block 装饰必须整行覆盖，否则 CodeMirror 会在渲染时抛错；缩进在引用/列表里的表格
 *   拿不到整行，索性保持源码不渲染
 * - 光标（含两侧边界）落在块里时让位给源码 —— 与图片/分割线同一档 caretTouches：
 *   点开源码后按 Home/← 回到块首、上下键路过停在块尾，严格内部判定会当场翻回部件，
 *   在块里挪一下光标就成了来回闪。
 * 不认横扫而过的选区：选区（⌘A、拖选）沿着 selectionTouches 走的话，选中一瞬间全篇
 * 表格/公式/frontmatter 会一起炸成源码，页面整个跳一次；块被选中时本就整块高亮，
 * 看得出选了什么。
 * 例外是整个落在块内部的非空选区：那是块已经展开、正在源码里选文字，此时改动文档
 * （⌘B 之类保留选区的命令）不能把块收回部件形态——光标判定在这种事务里帮不上忙，
 * caretPositions 拿不到任何空选区。拖选途中的形态另见 update 里的冻结
 */
function renderable(state: EditorState, r: BlockRange, caret: number[]): boolean {
  if (state.doc.lineAt(r.from).from !== r.from || state.doc.lineAt(r.to).to !== r.to) return false;
  return !caretTouches(caret, r.from, r.to) && !selectionInside(state, r.from, r.to);
}

function renderFlags(state: EditorState, ranges: BlockRange[]): boolean[] {
  const caret = caretPositions(state);
  let lastTo = -1;
  return ranges.map((r) => {
    // 增量扫描理论上不会给出重叠区间，真给出了也不能同时替换：重叠的 block 装饰会让
    // CodeMirror 抛错、整个编辑器白屏，所以这里兜一道（前一个已渲染的块之内的一律跳过）
    const ok = r.from > lastTo && renderable(state, r, caret);
    if (ok) lastTo = r.to;
    return ok;
  });
}

function sameFlags(a: boolean[], b: boolean[]): boolean {
  return a.length === b.length && a.every((flag, i) => flag === b[i]);
}

function buildBlockDecorations(ranges: BlockRange[], shown: boolean[]): BlockDecorations {
  const decos: Range<Decoration>[] = [];
  const rendered: CodeRange[] = [];
  ranges.forEach((r, i) => {
    if (!shown[i]) return;
    const widget =
      r.kind === "table"
        ? new TableWidget(r.payload)
        : r.kind === "frontmatter"
          ? new FrontmatterWidget(r.payload)
          : new MathBlockWidget(r.payload);
    decos.push(Decoration.replace({ widget, block: true }).range(r.from, r.to));
    rendered.push({ from: r.from, to: r.to });
  });
  const deco = Decoration.set(decos, true);
  return { rendered, deco, atomics: deco };
}

function withDecorations(state: EditorState, scan: BlockScan): BlockState {
  const shown = renderFlags(state, scan.ranges);
  return { ...scan, shown, ...buildBlockDecorations(scan.ranges, shown) };
}

const livePreviewBlockField = StateField.define<BlockState>({
  create(state) {
    return withDecorations(state, scanAll(state));
  },
  update(value, tr) {
    // 语法树是后台增量解析的：树换了也要重扫，否则大文档滚到后半程表格不渲染
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    const forced = tr.effects.some((e) => e.is(refreshLivePreview));
    const rescan = tr.docChanged || treeChanged;
    if (!rescan && !tr.selection && !forced) return value;

    if (!rescan) {
      // 区间没变，只可能是「哪些块要让位给源码」变了：命中集合一样就连装饰都不用碰。
      // forced（MathJax 就绪、附件读出来）必须重建——部件内容变了，区间却没变。
      // 选区非空时一律沿用上一轮的形态（caretPositions 此刻是空的，重算等于把所有块
      // 都收回部件形态）：和视图插件的「光标位置只在空选区时更新」是同一套规矩，
      // 展开的公式里拖选不会被收回去，拖选扫过的表格也不会中途炸开
      const shown = hasTextSelection(tr.state) ? value.shown : renderFlags(tr.state, value.ranges);
      if (!forced && sameFlags(shown, value.shown)) return value;
      return { ...value, shown, ...buildBlockDecorations(value.ranges, shown) };
    }

    return withDecorations(tr.state, rescanBlocks(value, tr));
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

/**
 * 全文的围栏代码区间 + 三类块级区间（表格、$$ 公式、frontmatter），不论此刻是不是
 * 以部件形态渲染。行内公式与脚注要按原文逐行扫描，这些地方的 `$`、`[^x]` 一律不算数：
 * 代码块里的是代码，$$ 块里的已经归块级公式管，frontmatter 压根不是正文。
 * 用的是块级字段已经缓存好的那份扫描结果，行内这边不必再遍历一次全文。
 */
export function blockGuardRanges(state: EditorState): CodeRange[] {
  const value = state.field(livePreviewBlockField, false);
  if (!value) return [];
  return [...value.codeRanges, ...value.ranges];
}

export const livePreviewBlocks: Extension = livePreviewBlockField;
