/**
 * Editing safeguards once color spans are hidden: Delete-key takeover + orphan tag cleanup.
 *
 * In live preview the opening/closing tags of `<span style="color:…">` are hidden and registered as atomic (see
 * livePreview/inline.ts). The cost falls entirely on Delete: default Backspace stepping one char left lands inside the hidden
 * tag, so @codemirror/commands' skipAtomic deletes the whole tag; the user thinks they deleted one char,
 * but actually deleted thirty-odd invisible ones, leaving a lone `</span>` in the text.
 *
 * So this does two things:
 * - Key takeover: when the cursor is right next to a hidden tag, skip the tag and delete the one char outside it, leaving the tag alone;
 * - Cleanup: when a tag still gets deleted whole (deleting a selection, cut, paste-over), delete the other half of the pair
 *   too; pairs whose inner text was emptied are removed as well, since they'd be invisible, undeletable junk.
 *
 * Both only apply in live preview (livePreview/index.ts): in source mode tags are visible plain text
 * and should delete normally; interfering would only get in the way.
 */

import {
  EditorState,
  Prec,
  Transaction,
  findClusterBreak,
  type ChangeDesc,
  type Extension,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  colorSpanPairsIn,
  skipHiddenColorTags,
  type ColorSpanTag,
} from "@/lib/editor/colorSpan";

/** Only take over for a single empty selection; everything else (selections, multiple cursors, IME composition) uses default behavior */
function loneCaret(view: EditorView): number | null {
  if (view.composing || view.compositionStarted) return null;
  const { selection } = view.state;
  return selection.ranges.length === 1 && selection.main.empty ? selection.main.head : null;
}

function backspaceOverTag(view: EditorView): boolean {
  const { state } = view;
  const head = loneCaret(view);
  if (head === null) return false;
  const start = skipHiddenColorTags(state, head, -1);
  if (start === head) return false; // Cursor isn't next to a hidden tag; not our concern
  // Start of doc: nothing to delete on the left. Swallow the key, since default behavior would delete through the tag
  if (start === 0) return true;
  const line = state.doc.lineAt(start);
  // Line start left of the tag: delete that newline (join with the previous line), same feel as without a tag
  const from =
    start === line.from
      ? start - 1
      : line.from + findClusterBreak(line.text, start - line.from, false, false);
  view.dispatch({
    changes: { from, to: start },
    // Cursor lands where the deleted char was (outside the tag), so further typing has normal color
    selection: { anchor: from },
    userEvent: "delete.backward",
    scrollIntoView: true,
  });
  return true;
}

function deleteOverTag(view: EditorView): boolean {
  const { state } = view;
  const head = loneCaret(view);
  if (head === null) return false;
  const end = skipHiddenColorTags(state, head, 1);
  if (end === head) return false;
  if (end === state.doc.length) return true; // End of doc; swallow as above
  const line = state.doc.lineAt(end);
  // Line end right of the tag: delete the newline, joining the next line up
  const to =
    end === line.to
      ? end + 1
      : line.from + findClusterBreak(line.text, end - line.from, true, true);
  view.dispatch({
    changes: { from: end, to },
    // Don't move the cursor: the deletion point is to its right, so it stays put next to it, still inside the span, and typing keeps this color
    userEvent: "delete.forward",
    scrollIntoView: true,
  });
  return true;
}

/** Whether this tag survives the change intact (position may shift, text must be identical); returns new coordinates if so.
    assoc points "toward the tag's inside": text inserted right against the tag isn't part of it */
function mappedTag(tr: Transaction, tag: ColorSpanTag, text: string): ColorSpanTag | null {
  const from = tr.changes.mapPos(tag.from, 1);
  const to = tr.changes.mapPos(tag.to, -1);
  if (to - from !== tag.to - tag.from) return null;
  return tr.newDoc.sliceString(from, to) === text ? { from, to } : null;
}

/** The tag was swallowed whole by a change. A few broken chars don't count: that basically can't happen under atomic,
    and if it does the user is editing at the source level, so don't delete the other end on their behalf */
function tagRemoved(changes: ChangeDesc, tag: ColorSpanTag): boolean {
  let removed = false;
  changes.iterChangedRanges((fromA, toA) => {
    if (fromA <= tag.from && toA >= tag.to) removed = true;
  });
  return removed;
}

/**
 * Orphan tag cleanup: when a user deletion leaves half of a pair, append a change that removes the other half.
 * Pairs whose inner text was emptied (opening and closing tags now adjacent) are removed too.
 *
 * Only user events, skipping undo/redo: history carries complete before/after states, and an extra change would stop undo from restoring the original.
 */
const colorSpanCleanup = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  const event = tr.annotation(Transaction.userEvent);
  if (!event || event === "undo" || event === "redo") return tr;

  // Only changes that deleted something can create orphans. Pure inserts (typing, IME commit) pass straight through,
  // avoiding a syntax-tree scan on every keystroke
  let delFrom = -1;
  let delTo = -1;
  tr.changes.iterChangedRanges((fromA, toA) => {
    if (toA <= fromA) return;
    if (delFrom < 0) delFrom = fromA;
    delTo = toA;
  });
  if (delFrom < 0) return tr;

  const before = tr.startState;
  const drop: { from: number; to: number }[] = [];
  for (const pair of colorSpanPairsIn(before, delFrom, delTo)) {
    const openText = before.sliceDoc(pair.open.from, pair.open.to);
    const closeText = before.sliceDoc(pair.close.from, pair.close.to);
    const open = mappedTag(tr, pair.open, openText);
    const close = mappedTag(tr, pair.close, closeText);
    if (open && close) {
      // Both tags remain but everything between was deleted: this empty pair is invisible and undeletable, remove it
      if (!pair.empty && open.to === close.from) drop.push({ from: open.from, to: close.to });
    } else if (open && tagRemoved(tr.changes, pair.close)) {
      drop.push(open);
    } else if (close && tagRemoved(tr.changes, pair.open)) {
      drop.push(close);
    }
  }
  if (drop.length === 0) return tr;

  // Coordinates are already in the post-change doc, so use sequential; nested spans may order outer cleanups
  // after inner ones, and ChangeSet only accepts ascending order
  drop.sort((a, b) => a.from - b.from);
  // An outer empty span's cleanup range encloses the inner one entirely, and ChangeSet throws on overlapping changes: keep only disjoint ones
  const merged = drop.filter((d, i) => i === 0 || d.from >= drop[i - 1].to);
  return [tr, { changes: merged, sequential: true }];
});

/**
 * Prec.highest rather than high: must run before markdownKeymap's deleteMarkupBackward (Prec.high),
 * for the same reason as pairs.ts. Returns false immediately when not next to a hidden tag, leaving other deletions untouched.
 */
export const colorSpanKeys: Extension = [
  Prec.highest(
    keymap.of([
      { key: "Backspace", run: backspaceOverTag },
      { key: "Delete", run: deleteOverTag },
    ])
  ),
  colorSpanCleanup,
];
