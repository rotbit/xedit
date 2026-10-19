import { syntaxTree } from "@codemirror/language";
import type { EditorState, Transaction } from "@codemirror/state";
import { parseFrontmatter } from "@/lib/frontmatter";
import { inCodeRanges, type CodeRange } from "@/lib/livePreview/context";

/**
 * Range scanning for block-level live rendering (tables, $$ math, leading frontmatter).
 *
 * Pulled out of blocks.ts because it has its own state: whole-doc table/fence ranges cached across transactions,
 * with each keystroke rescanning only the lines the change covers — a full `syntaxTree().iterate()` on the keystroke path
 * was the direct cause of typing lag (a long doc has thousands of block-level nodes).
 *
 * Incremental edge cases are collected in rescanBlocks' comments: changes that can be spliced in place go incremental,
 * anything that might affect distant structure (adding/removing fence chars, large edits, background parse completing the tree) falls back to a full scan.
 */

export interface BlockRange extends CodeRange {
  kind: "table" | "math" | "frontmatter";
  /** Source text for tables and frontmatter, TeX for math; used for the widget's eq */
  payload: string;
}

export interface BlockScan {
  /** Table ranges from the syntax tree (whole doc), cached together with codeRanges for incremental rescans */
  tables: BlockRange[];
  /** Fenced code block ranges: pairing math delimiters relies on them to exclude $$ inside code blocks */
  codeRanges: CodeRange[];
  frontmatter: BlockRange | null;
  /** Offsets of $$ lines in the source; normal typing only updates the lines involved in the change. */
  mathDelimiters: number[];
  /** Final merged and sorted list of the three block kinds, consumed directly by decoration building */
  ranges: BlockRange[];
}

/** Frontmatter can only be in the first few lines; cap it so a body that "starts with --- and has another --- much later"
 *  doesn't get swallowed whole into the card */
const FRONTMATTER_MAX_LINES = 40;

/** Full scan when inserting/deleting more than this many chars: pastes and large deletions reflow most of the doc anyway,
 *  and splicing the cache is neither cheap nor less error-prone */
const FULL_RESCAN_LENGTH = 1000;

/**
 * Characters that can affect distant structure; if they appear in a change, fall back to a full scan:
 * - ` and ~: adding/removing a fence pair swallows or releases whole sections of what follows into/from a code block
 * - <: an HTML block runs from its opening tag to a blank line, which can likewise swallow tables below
 * These are rarely typed in prose, so normal typing still goes incremental.
 */
const RISKY_CHARS = /[`~<]/;

/**
 * Range of the leading frontmatter. Uses a text scan rather than the syntax tree: Setext headings are disabled,
 * so `---` in the tree is just two independent HorizontalRules with no pairing.
 * At least one key must parse for it to count — otherwise an article starting with a divider would be misdetected as frontmatter.
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

/** Build the index from the full doc on first load; afterwards only scan lines the transaction covers, avoiding a walk over every line per keystroke. */
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
  const changed: CodeRange[] = [];
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

/** Pair delimiter lines into math blocks; delimiters inside or spanning code blocks aren't paired. */
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
    // First and last lines are delimiters, the TeX is in between
    const tex = doc.sliceString(openFrom, to).split("\n").slice(1, -1).join("\n").trim();
    if (tex) out.push({ kind: "math", from: openFrom, to, payload: tex });
    openFrom = -1;
  }
  return out;
}

/** Walk the syntax tree over [from, to] collecting table and fence ranges. Nodes intersecting the range are returned whole
 *  (iterate's semantics), so a partial rescan still gets full block bounds and never cuts a table in half. */
function scanTree(state: EditorState, from: number, to: number) {
  const codeRanges: CodeRange[] = [];
  const tables: BlockRange[] = [];
  syntaxTree(state).iterate({
    from,
    to,
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
      // Inline formatting can't contain block-level tables/fences, so no need to visit the emphasis, link, etc. nodes inside.
      if (node.name === "Paragraph" || /^ATXHeading/.test(node.name)) return false;
      return undefined;
    },
  });
  return { tables, codeRanges };
}

function mergeRanges(frontmatter: BlockRange | null, tables: BlockRange[], math: BlockRange[]): BlockRange[] {
  return [...(frontmatter ? [frontmatter] : []), ...tables, ...math].sort((a, b) => a.from - b.from);
}

/** Full rescan. mathDelimiters can take an existing index (when the tree completes, delimiter lines haven't changed, so no need to walk every line). */
export function scanAll(state: EditorState, mathDelimiters = collectMathDelimiters(state)): BlockScan {
  const { tables, codeRanges } = scanTree(state, 0, state.doc.length);
  const frontmatter = scanFrontmatter(state);
  return {
    tables,
    codeRanges,
    frontmatter,
    mathDelimiters,
    ranges: mergeRanges(frontmatter, tables, scanMathBlocks(state, codeRanges, mathDelimiters)),
  };
}

/**
 * The range to rescan: changes are always widened to whole lines, then one more line each way.
 * Widening is required — block structure regroups at line boundaries: typing a new `| a | b |` line under a table's last row grows the table by a row,
 * and looking only at the changed line would leave the old cached table range (not intersecting the change) in place, while the new table gets dropped as overlapping.
 */
function changedSpan(tr: Transaction): CodeRange | null {
  const doc = tr.state.doc;
  let from = Number.POSITIVE_INFINITY;
  let to = -1;
  tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    from = Math.min(from, fromB);
    to = Math.max(to, toB);
  });
  if (to < 0) return null;
  const firstLine = doc.lineAt(from).number;
  const lastLine = doc.lineAt(to).number;
  return {
    from: doc.line(Math.max(1, firstLine - 1)).from,
    to: doc.line(Math.min(doc.lines, lastLine + 1)).to,
  };
}

/** Whether a change might affect structure outside the rescan range (adding/removing fence/HTML chars, large edits) — if so, skip incremental */
function needsFullRescan(tr: Transaction): boolean {
  let risky = false;
  let total = 0;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (risky) return;
    total += toA - fromA + inserted.length;
    if (total > FULL_RESCAN_LENGTH) {
      risky = true;
      return;
    }
    // Check both inserted and deleted text: deleting a ``` likewise changes what the rest of the doc belongs to
    risky =
      RISKY_CHARS.test(inserted.toString()) ||
      RISKY_CHARS.test(tr.startState.doc.sliceString(fromA, toA));
  });
  return risky;
}

/**
 * Shift cached ranges to new coordinates and merge with the rescan results.
 * A cached range yields to new results in two cases: it intersects the rescan range (the rescan already gives full ranges from the new tree),
 * or it overlaps some new range (the same block reported by both sides; keeping the old one would cause overlapping decorations).
 */
function mergeCached<T extends CodeRange>(cached: T[], fresh: T[], tr: Transaction, span: CodeRange): T[] {
  const out = [...fresh];
  for (const range of cached) {
    const from = tr.changes.mapPos(range.from, 1);
    const to = tr.changes.mapPos(range.to, -1);
    if (to >= span.from && from <= span.to) continue;
    if (fresh.some((f) => f.to >= from && f.from <= to)) continue;
    out.push({ ...range, from, to });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** Block ranges after a transaction. Rescan only near the change when incremental is possible, otherwise fall back to a full scan. */
export function rescanBlocks(previous: BlockScan, tr: Transaction): BlockScan {
  // Only the syntax tree changed (background incremental parse finished the latter half; see @codemirror/language's parseWorker):
  // there's no way to know what differs between old and new trees, so full scan. Luckily these transactions happen when idle, not on the keystroke path.
  if (!tr.docChanged) return scanAll(tr.state, previous.mathDelimiters);

  const mathDelimiters = updateMathDelimiters(previous.mathDelimiters, tr);
  const span = needsFullRescan(tr) ? null : changedSpan(tr);
  if (!span) return scanAll(tr.state, mathDelimiters);

  const fresh = scanTree(tr.state, span.from, span.to);
  const tables = mergeCached(previous.tables, fresh.tables, tr, span);
  const codeRanges = mergeCached(previous.codeRanges, fresh.codeRanges, tr, span);
  // Frontmatter can only fall within the first FRONTMATTER_MAX_LINES lines: a change starting after that can't affect it,
  // and its range is before the change so needs no shifting; keep the whole cache as-is (saves a YAML parse)
  const head = tr.state.doc.line(Math.min(tr.state.doc.lines, FRONTMATTER_MAX_LINES)).to;
  const frontmatter = span.from <= head ? scanFrontmatter(tr.state) : previous.frontmatter;

  return {
    tables,
    codeRanges,
    frontmatter,
    mathDelimiters,
    ranges: mergeRanges(frontmatter, tables, scanMathBlocks(tr.state, codeRanges, mathDelimiters)),
  };
}
