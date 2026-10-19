import type { SyntaxNode } from "@lezer/common";
import { syntaxTree } from "@codemirror/language";
import { Decoration, type WidgetType } from "@codemirror/view";
import { StateEffect, type EditorState, type Range } from "@codemirror/state";

/**
 * Shared predicates and decoration collector for live rendering.
 *
 * Decorations take two paths: inline/line-level ones go through the view plugin (livePreview/index.ts), multi-line replacements (tables, block math)
 * can only use a state field (CodeMirror forbids plugins from providing multi-line replace). Both must share the same cursor/selection
 * rules, or the same move would produce contradictory reveal results, so the predicates live here.
 */

/** Trigger a decoration recompute via a lightweight effect (used at the end of mouse clicks and when MathJax becomes ready asynchronously). */
export const refreshLivePreview = StateEffect.define<null>();

/** Cursor positions (empty selections only): basis for node-level reveal decisions */
export function caretPositions(state: EditorState): number[] {
  return state.selection.ranges.filter((r) => r.empty).map((r) => r.head);
}

export function hasTextSelection(state: EditorState): boolean {
  return state.selection.ranges.some((range) => !range.empty);
}

/** Whether the cursor is inside a fenced code block (including the fence lines).
    The same check serves two purposes: live rendering switches to a light cursor; the slash menu refuses to open —
    typing `/` in code means a path, regex, or comment, and a menu would just get in the way */
export function caretInFencedCode(state: EditorState): boolean {
  const pos = state.selection.main.head;
  for (const side of [-1, 1] as const) {
    let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side);
    for (; n; n = n.parent) if (n.name === "FencedCode") return true;
  }
  return false;
}

/** Any selection (including non-empty) overlaps [from, to] — the reveal check for line-level markers (#, >, fence lines).
    Revealed line markers are zero-width hanging boxes or monospace replacements that don't shift the text, so they can generously follow the selection:
    whichever lines are selected show their markers, so users see what they've selected / are about to copy.
    Block widgets (tables/math/images) don't use this tier — revealing their source changes the whole block's height,
    and ⌘A or a drag would burst the whole doc open; see renderable in blocks.ts */
export function selectionTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.to >= from && r.from <= to);
}

/** A non-empty selection lies entirely inside (from, to) — the check for a block widget "already expanded, with text being selected inside".
    Must be strictly interior: when a drag sweeps a whole block, atomicRanges snaps the selection ends to from/to,
    so including boundaries would treat "dragging across the block from outside" as "selecting inside", bursting the block into source */
export function selectionInside(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => !r.empty && r.from > from && r.to < to);
}

/** Cursor within [from, to] (inclusive) — the reveal check shared by inline syntax and whole widgets (images/video/dividers/tables/math).
    Boundaries must count: after opening the source, the cursor moving to either end (line start, after `)`, end of `---`)
    lands right on a boundary; a strict-interior check would flip back to the widget, so moving within the line would flicker.
    Cursor only, not selections: on drag/select-all every widget would gain a few lines of source and the layout would jolt */
export function caretTouches(caret: number[], from: number, to: number): boolean {
  return caret.some((p) => p >= from && p <= to);
}

/** Cursor within [from, to) (left-inclusive, right-exclusive) — the reveal check for task markers `[ ]`.
    The right boundary (after `]`) is where ← from the first text character lands and the most common resting spot; including it would
    turn the checkbox into `[x]` text on a single left arrow; the left boundary is the entry point when walking right from line start, and must reveal the source for editing */
export function caretAtStartOrInside(caret: number[], from: number, to: number): boolean {
  return caret.some((p) => p >= from && p < to);
}

export interface CodeRange {
  from: number;
  to: number;
}

/** Whether a position falls inside any fenced code block */
export function inCodeRanges(ranges: CodeRange[], pos: number): boolean {
  return ranges.some((r) => pos >= r.from && pos <= r.to);
}

/** Visible line range (inclusive line numbers) */
interface LineSpan {
  first: number;
  last: number;
}

/** Widen visible ranges by margin lines in each direction and align to whole lines.
    The margin is for scrolling: if decorations for the line at the viewport edge only arrive the frame it scrolls in, line backgrounds lag a beat. */
export function visibleLineRanges(
  state: EditorState,
  ranges: readonly CodeRange[],
  margin = 2
): CodeRange[] {
  const total = state.doc.lines;
  const clamp = (pos: number) => Math.max(0, Math.min(state.doc.length, pos));
  return ranges.map((r) => {
    const first = Math.max(1, state.doc.lineAt(clamp(r.from)).number - margin);
    const last = Math.min(total, state.doc.lineAt(clamp(r.to)).number + margin);
    return { from: state.doc.line(first).from, to: state.doc.line(last).to };
  });
}

/** Convert position ranges to line ranges, merging overlapping/adjacent segments along the way.
    Without merging, two visible segments in the same block would process the overlap twice: line classes are deduplicated so nothing is drawn twice,
    but it's wasted work and inflates the line-count metric */
function toLineSpans(state: EditorState, ranges: readonly CodeRange[]): LineSpan[] {
  const spans = ranges
    .map((r) => ({
      first: state.doc.lineAt(r.from).number,
      last: state.doc.lineAt(r.to).number,
    }))
    .sort((a, b) => a.first - b.first);
  const merged: LineSpan[] = [];
  for (const span of spans) {
    const prev = merged[merged.length - 1];
    if (prev && span.first <= prev.last + 1) prev.last = Math.max(prev.last, span.last);
    else merged.push({ ...span });
  }
  return merged;
}

export interface LpContext {
  readonly state: EditorState;
  readonly caret: number[];
  readonly decos: Range<Decoration>[];
  readonly atomics: Range<Decoration>[];
  /** Fenced code block ranges collected this time: line scans (blank lines, math) skip them */
  readonly codeRanges: CodeRange[];
  /** Inline math ranges found this time (see inlineMath.ts): characters inside are TeX, no longer treated as Markdown markers */
  readonly mathRanges: CodeRange[];
  /** Hide a span of source (takes no space) */
  hide(from: number, to: number): void;
  /** Replace with a widget and register as atomic: the cursor skips over it whole and passing doesn't reveal it */
  replaceAtomic(from: number, to: number, widget?: WidgetType): void;
  /** Whether this span falls inside inline math — hide/replaceAtomic silently reject such ranges (see inMath below).
      Places that need "hide several spans together, all or nothing" (the opening/closing tags of a color span) must ask first,
      otherwise only one end gets hidden and the other is left dangling in the text */
  inMath(from: number, to: number): boolean;
  /** Add a line class to the line at pos; added once per class per line (nested structures hit repeatedly) */
  lineClass(pos: number, cls: string): void;
  /** Add the line class to every line covered by [from, to]; with visible, only paint lines within the visible ranges.
      The callback's first/last are always the block's real first/last line numbers; returns the number of lines actually visited */
  eachLine(
    from: number,
    to: number,
    cls: (n: number, first: number, last: number) => string
  ): number;
  /** Cursor or selection on the line containing pos — the reveal check for line-start markers (#, >) */
  lineActive(pos: number): boolean;
  /** Count readable by diagnostics/tests: total lines visited by eachLine */
  readonly stats: { linesVisited: number };
}

/**
 * @param visible visible ranges (position ranges, usually view.visibleRanges widened by a few lines; see visibleLineRanges).
 *   If omitted, the old behavior: eachLine walks the whole block. If given, only lines intersecting the visible ranges are walked — a 3,000-line code block
 *   with just one line in the viewport used to lay down 3,000 line decorations, redone on every cursor move.
 */
export function createLpContext(
  state: EditorState,
  caret: number[],
  visible?: readonly CodeRange[]
): LpContext {
  const decos: Range<Decoration>[] = [];
  const atomics: Range<Decoration>[] = [];
  const codeRanges: CodeRange[] = [];
  const mathRanges: CodeRange[] = [];
  const seenLineClass = new Set<string>();
  const spans = visible ? toLineSpans(state, visible) : null;
  const stats = { linesVisited: 0 };

  /** Intersects a registered inline math range. Math is scanned before the syntax tree pass, and the `*` in `$a*b*c$`
      is part of the TeX: hidden as an emphasis marker, it would be invisible and undeletable in source, and two replaces
      stacked on the same span make CodeMirror throw. So every replacing decoration has to pass this check first */
  const inMath = (from: number, to: number) =>
    mathRanges.some((r) => from < r.to && to > r.from);

  const lineClass = (pos: number, cls: string) => {
    const line = state.doc.lineAt(pos);
    const key = `${line.from}:${cls}`;
    if (seenLineClass.has(key)) return;
    seenLineClass.add(key);
    decos.push(Decoration.line({ class: cls }).range(line.from));
  };

  return {
    state,
    caret,
    decos,
    atomics,
    codeRanges,
    mathRanges,
    hide(from, to) {
      if (from < to && !inMath(from, to)) decos.push(Decoration.replace({}).range(from, to));
    },
    inMath,
    replaceAtomic(from, to, widget) {
      if (inMath(from, to)) return;
      const deco = Decoration.replace(widget ? { widget } : {}).range(from, to);
      decos.push(deco);
      atomics.push(deco);
    },
    lineClass,
    eachLine(from, to, cls) {
      // first/last are the block's real first/last lines, regardless of the visible range: visibility only decides "which lines to paint",
      // not "which is the first line" — otherwise, scrolled to the middle of a code block, the viewport's top line would be drawn as the block start with rounded corners
      const first = state.doc.lineAt(from).number;
      const last = state.doc.lineAt(to).number;
      let visited = 0;
      const run = (lo: number, hi: number) => {
        for (let n = lo; n <= hi; n++) {
          lineClass(state.doc.line(n).from, cls(n, first, last));
          visited++;
        }
      };
      if (spans) {
        for (const span of spans) {
          const lo = Math.max(first, span.first);
          const hi = Math.min(last, span.last);
          if (lo <= hi) run(lo, hi);
        }
      } else {
        run(first, last);
      }
      stats.linesVisited += visited;
      return visited;
    },
    lineActive(pos) {
      const line = state.doc.lineAt(pos);
      return caretTouches(caret, line.from, line.to) || selectionTouches(state, line.from, line.to);
    },
    stats,
  };
}
