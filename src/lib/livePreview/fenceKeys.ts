import { syntaxTree } from "@codemirror/language";
import { Prec, type EditorState, type Extension, type Line } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

/**
 * Delete keys for fenced code blocks under live rendering.
 *
 * Why: the opening fence is replaced by a language dropdown and the closing fence is hidden entirely, both atomic ranges. The default
 * Backspace / Delete still delete character by character across atomic boundaries, removing invisible ```,
 * so either the block falls apart or the rest of the document gets swallowed into the code block.
 *
 * Fix: take over delete keys at the fence entry/exit points — never merge across a fence (swallow the key), instead first move
 * the cursor where it should go; only when "the block's content is already empty" do we actually touch the doc, deleting the whole block.
 * Priority Prec.high: above the default keymap, below the slash menu's Prec.highest (while the menu is open
 * it doesn't handle delete keys itself, so they don't conflict). The extension is attached to livePreview, so it has no effect in source mode.
 */

export interface FencedBlock {
  readonly node: SyntaxNode;
  /** Opening fence line (```lang) */
  readonly firstLine: Line;
  /** Closing fence line (```); null for unclosed blocks */
  readonly lastLine: Line | null;
  /** Start of the content area: start of the first content line; falls back to the end of the opening line when there are no content lines */
  readonly contentFrom: number;
  /** End of the content area: end of the last content line */
  readonly contentTo: number;
  readonly closed: boolean;
}

function clampPos(state: EditorState, pos: number): number {
  return Math.max(0, Math.min(state.doc.length, pos));
}

/** The fenced code block containing pos; null when not inside a block (including boundary lines) */
export function fencedCodeAt(
  state: EditorState,
  pos: number,
  side: -1 | 0 | 1 = 0
): FencedBlock | null {
  const at = clampPos(state, pos);
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(at, side);
  for (; node; node = node.parent) if (node.name === "FencedCode") break;
  if (!node) return null;

  const firstLine = state.doc.lineAt(clampPos(state, node.from));
  const marks = node.getChildren("CodeMark");
  let lastLine: Line | null =
    marks.length >= 2 ? state.doc.lineAt(clampPos(state, marks[marks.length - 1].from)) : null;
  // A single-line ``` (opening and closing on the same line) doesn't count as closed, or the content area would be a negative range
  if (lastLine && lastLine.number <= firstLine.number) lastLine = null;

  const endLine = lastLine ?? state.doc.lineAt(clampPos(state, node.to));
  // Even if the cursor resolves into this node, it doesn't count when it lies outside the block's bounds (e.g. after the closing line's newline)
  if (at < firstLine.from || at > endLine.to) return null;

  const hasContent = lastLine
    ? lastLine.number > firstLine.number + 1
    : endLine.number > firstLine.number;
  const contentFrom = hasContent ? clampPos(state, firstLine.to + 1) : firstLine.to;
  const rawTo = lastLine ? lastLine.from - 1 : node.to;
  const contentTo = Math.max(contentFrom, clampPos(state, rawTo));

  return { node, firstLine, lastLine, contentFrom, contentTo, closed: lastLine !== null };
}

/** Content area is all whitespace (or has no content lines at all) */
export function isContentEmpty(state: EditorState, block: FencedBlock): boolean {
  if (block.contentTo <= block.contentFrom) return true;
  return state.sliceDoc(block.contentFrom, block.contentTo).trim().length === 0;
}

/** Delete the whole block (plus one adjacent newline so no blank line is left behind); exported for reuse by the opening line's delete button */
export function deleteFencedBlock(view: EditorView, block: FencedBlock): void {
  const { state } = view;
  const len = state.doc.length;
  let from = clampPos(state, block.firstLine.from);
  let to = clampPos(state, block.lastLine ? block.lastLine.to : block.node.to);
  if (to < len && state.sliceDoc(to, to + 1) === "\n") to += 1;
  else if (from > 0 && state.sliceDoc(from - 1, from) === "\n") from -= 1;

  view.dispatch({
    changes: { from, to },
    selection: { anchor: Math.max(0, Math.min(from, len - (to - from))) },
    userEvent: "delete",
    scrollIntoView: true,
  });
}

/** Try both sides: with the cursor on a fence boundary, a single side may resolve to a sibling node outside the block */
function fenceAt(state: EditorState, pos: number): FencedBlock | null {
  return fencedCodeAt(state, pos, -1) ?? fencedCodeAt(state, pos, 1);
}

/** Whether pos is on a content line (opening and closing fence lines don't count) */
function onContentLine(state: EditorState, block: FencedBlock, pos: number): boolean {
  const line = state.doc.lineAt(clampPos(state, pos));
  if (line.number <= block.firstLine.number) return false;
  return block.lastLine ? line.number < block.lastLine.number : true;
}

/** Move the cursor only, without touching the doc */
function moveCaret(view: EditorView, pos: number): true {
  view.dispatch({
    selection: { anchor: clampPos(view.state, pos) },
    scrollIntoView: true,
  });
  return true;
}

/** When the cursor is outside but right next to a block on that side, return the block (dir: -1 looks at the previous line, 1 at the next) */
function adjacentFence(state: EditorState, line: Line, dir: -1 | 1): FencedBlock | null {
  const n = line.number + dir;
  if (n < 1 || n > state.doc.lines) return null;
  const neighbor = state.doc.line(n);
  const block = fencedCodeAt(state, neighbor.from, 1);
  if (!block) return null;
  if (dir === -1) return block.lastLine?.number === neighbor.number ? block : null;
  return block.firstLine.number === neighbor.number ? block : null;
}

function handleBackspace(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;
  const pos = range.head;
  const line = state.doc.lineAt(pos);
  const block = fenceAt(state, pos);

  if (block) {
    // 1) Content is already empty: keeping the block is just junk, delete it all at once
    if (onContentLine(state, block, pos) && isContentEmpty(state, block)) {
      deleteFencedBlock(view, block);
      return true;
    }
    // 2) Start of the first content line: default behavior would merge the first code line into the opening fence; swallow it
    if (pos === block.contentFrom && !isContentEmpty(state, block)) return true;
    // 3) Start of the closing line: the closing line is hidden, so step back to the end of the previous line (the last content line)
    if (block.lastLine && pos === block.lastLine.from) {
      return moveCaret(view, state.doc.line(block.lastLine.number - 1).to);
    }
    // 4) Start of the opening line: don't merge with the previous line, just move the cursor to the end of the previous line
    if (pos === block.firstLine.from && line.number > 1) {
      return moveCaret(view, state.doc.line(line.number - 1).to);
    }
    return false;
  }

  // 5) Start of the line right after the closing fence: delete it if blank; either way the cursor goes back to the end of the block's last content line
  const above = pos === line.from ? adjacentFence(state, line, -1) : null;
  if (above) {
    if (line.length === 0 && line.from > 0) {
      view.dispatch({
        changes: { from: line.from - 1, to: line.to },
        selection: { anchor: clampPos(state, above.contentTo) },
        userEvent: "delete",
        scrollIntoView: true,
      });
      return true;
    }
    return moveCaret(view, above.contentTo);
  }
  return false;
}

function handleDelete(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;
  const pos = range.head;
  const line = state.doc.lineAt(pos);
  const block = fenceAt(state, pos);

  if (block) {
    // 1) Content is already empty: delete the whole block
    if (onContentLine(state, block, pos) && isContentEmpty(state, block)) {
      deleteFencedBlock(view, block);
      return true;
    }
    // 2) End of the last content line: next comes the closing fence; swallow it
    if (pos === block.contentTo && !isContentEmpty(state, block)) return true;
    // 3) End of the opening line: forward delete would pull the first code line up; swallow it
    if (pos === block.firstLine.to) return true;
    // 4) End of the closing line: jump to the start of the next line outside the block, don't pull following text into the code block
    if (block.lastLine && pos === block.lastLine.to && block.lastLine.number < state.doc.lines) {
      return moveCaret(view, state.doc.line(block.lastLine.number + 1).from);
    }
    return false;
  }

  // 5) End of the line right before the opening fence: move into the block, to the start of the first content line
  const below = pos === line.to ? adjacentFence(state, line, 1) : null;
  if (below) return moveCaret(view, below.contentFrom);
  return false;
}

/** Select-all inside a block selects only the content first: ⌘A → Backspace → Backspace deletes the whole block in three steps */
function handleSelectAll(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  // Already selecting the whole doc: shrinking back to the code block would look like select-all broke (pressing ⌘A twice is a common gesture)
  if (range.from === 0 && range.to === state.doc.length) return false;
  const block = fenceAt(state, range.head);
  if (!block) return false;
  const { contentFrom, contentTo } = block;
  if (range.head < contentFrom || range.head > contentTo) return false;
  if (range.from === contentFrom && range.to === contentTo) return false;
  view.dispatch({
    selection: { anchor: contentFrom, head: contentTo },
    scrollIntoView: true,
  });
  return true;
}

export const fenceKeymap: Extension = Prec.high(
  keymap.of([
    { key: "Backspace", run: handleBackspace },
    { key: "Delete", run: handleDelete },
    { key: "Mod-a", run: handleSelectAll },
  ])
);
