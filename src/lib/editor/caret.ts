import { StateField, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Caret appearance extension: conditions for smooth caret. Styles live in editor.css; this only sets the state class.
 * The current-line background was removed: in document-style layout the caret alone locates you, and an extra background became a second layout element.
 *
 * The state class goes through editorAttributes.compute, not manual classList edits:
 * CodeMirror syncs root attributes with a whole-string setAttribute("class"), so manually added classes get wiped on any
 * attribute recompute elsewhere; and compute writes the class during update, before the cursor layer's measure draws,
 * so timing is naturally correct, with no timers and no impact from rAF pausing in background tabs.
 */

/**
 * Whether the last transaction changed the document. Only "jumping" the caret gets smoothing: click-to-place, up/down line moves.
 * While typing the caret must stay right on the new character; a transition would drag a trail and look like it jumps back then catches up,
 * so the transition class is removed as soon as the doc changes, and restored on the next pure selection move.
 */
const lastTrChangedDoc = StateField.define<boolean>({
  create: () => false,
  update: (_prev, tr) => tr.docChanged,
});

const smoothCaretClass = EditorView.editorAttributes.compute([lastTrChangedDoc], (state) => ({
  class: state.field(lastTrChangedDoc) ? "" : "cm-caret-smooth",
}));

export const caretAndActiveLine: Extension = [
  lastTrChangedDoc,
  smoothCaretClass,
];
