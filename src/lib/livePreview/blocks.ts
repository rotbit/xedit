import { syntaxTree } from "@codemirror/language";
import { RangeSet, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { MathBlockWidget, TableWidget } from "@/lib/livePreview/blockWidgets";
import { FrontmatterWidget, isCoverOnlyFrontmatter } from "@/lib/livePreview/frontmatterWidget";
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
 * Block-level live rendering (tables, $$ math, frontmatter) — must use a state field rather than a view plugin:
 * CodeMirror explicitly says "multi-line replace decorations may not be provided by plugins" (it throws RangeError),
 * and whole tables/math blocks naturally span lines.
 *
 * Fields can't see visibleRanges, so we cache whole-document block ranges (scanning and incremental updates live in blockScan.ts);
 * this file handles just two things: which blocks should yield to source right now, and building decorations from that.
 */

interface BlockDecorations {
  /** Ranges actually replaced this time: the plugin's line scan skips them (hidden lines shouldn't get line classes) */
  rendered: CodeRange[];
  deco: DecorationSet;
  atomics: DecorationSet;
}

interface BlockState extends BlockDecorations, BlockScan {
  /** Same order as ranges: whether each block is currently rendered as a widget. On cursor moves we compare this set first;
   *  if unchanged we reuse the previous decorations instead of rebuilding every widget in the doc */
  shown: boolean[];
}

/**
 * Whether a block renders as a widget (false = show source). Two rules:
 * - block decorations must cover whole lines, or CodeMirror throws while rendering; tables indented inside quotes/lists
 *   can't get whole lines, so just keep them as unrendered source
 * - when the cursor (including both boundaries) is inside the block, yield to source — same caretTouches tier as images/dividers:
 *   after opening the source, Home/← back to the block start or arrowing past to stop at the block end would flip it back to a widget
 *   under a strict-interior check, so moving the cursor inside the block would flicker back and forth.
 * Sweeping selections don't count: if selections (⌘A, drag) followed selectionTouches, the moment you select, every
 * table/math/frontmatter in the doc would burst into source and the whole page would jump; a selected block is already highlighted
 * as a whole, so you can see what's selected.
 * The exception is a non-empty selection entirely inside a block: the block is already expanded and text is being selected in source, so editing
 * the doc then (selection-preserving commands like ⌘B) mustn't collapse it back to a widget — the caret check can't help in such transactions,
 * since caretPositions has no empty selections. For the drag-in-progress state see the freeze in update
 */
function renderable(state: EditorState, r: BlockRange, caret: number[]): boolean {
  if (state.doc.lineAt(r.from).from !== r.from || state.doc.lineAt(r.to).to !== r.to) return false;
  // Frontmatter containing only a cover always renders as an image and never yields to source (see isCoverOnlyFrontmatter for why)
  if (r.kind === "frontmatter" && isCoverOnlyFrontmatter(r.payload)) return true;
  return !caretTouches(caret, r.from, r.to) && !selectionInside(state, r.from, r.to);
}

function renderFlags(state: EditorState, ranges: BlockRange[]): boolean[] {
  const caret = caretPositions(state);
  let lastTo = -1;
  return ranges.map((r) => {
    // Incremental scanning shouldn't produce overlapping ranges, but if it does they can't both be replaced: overlapping block decorations make
    // CodeMirror throw and white-screen the whole editor, so guard here (skip anything inside the previous rendered block)
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
    // The syntax tree is parsed incrementally in the background: a new tree also needs a rescan, or tables in the latter half of big docs won't render
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    const forced = tr.effects.some((e) => e.is(refreshLivePreview));
    const rescan = tr.docChanged || treeChanged;
    if (!rescan && !tr.selection && !forced) return value;

    if (!rescan) {
      // Ranges unchanged, so only "which blocks yield to source" can have changed: if the hit set is the same, don't touch decorations at all.
      // forced (MathJax ready, attachment loaded) must rebuild — widget content changed even though ranges didn't.
      // With a non-empty selection, always keep the previous round's state (caretPositions is empty then, so recomputing would collapse
      // every block back to a widget): same rule as the view plugin's "caret positions update only on empty selections",
      // so drag-selecting inside expanded math won't collapse it, and tables swept by a drag won't burst open midway
      const shown = hasTextSelection(tr.state) ? value.shown : renderFlags(tr.state, value.ranges);
      if (!forced && sameFlags(shown, value.shown)) return value;
      return { ...value, shown, ...buildBlockDecorations(value.ranges, shown) };
    }

    return withDecorations(tr.state, rescanBlocks(value, tr));
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.deco),
    // Skip tables/math as a whole: when arrowing past, the cursor stops at the boundaries and the widget doesn't revert or jump
    EditorView.atomicRanges.of((view) => view.state.field(f, false)?.atomics ?? RangeSet.empty),
  ],
});

/** Ranges currently replaced by block widgets, for the plugin's line scan to avoid */
export function renderedBlockRanges(state: EditorState): CodeRange[] {
  return state.field(livePreviewBlockField, false)?.rendered ?? [];
}

/**
 * Whole-document fenced code ranges + the three block range kinds (tables, $$ math, frontmatter), whether or not they're
 * currently rendered as widgets. Inline math and footnotes scan the source line by line, and `$` / `[^x]` in these places never count:
 * in code blocks they're code, in $$ blocks they belong to block math, and frontmatter isn't body text at all.
 * Uses the scan result already cached by the block field, so the inline side doesn't traverse the whole doc again.
 */
export function blockGuardRanges(state: EditorState): CodeRange[] {
  const value = state.field(livePreviewBlockField, false);
  if (!value) return [];
  return [...value.codeRanges, ...value.ranges];
}

export const livePreviewBlocks: Extension = livePreviewBlockField;
