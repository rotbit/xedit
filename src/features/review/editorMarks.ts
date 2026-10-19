/**
 * Review marks in the body: a CodeMirror extension installed in the editor.
 *
 * Why marks live in the editor rather than the rendered view: while reviewing, the author sits in the editing area, so comments must be drawn on
 * the very words being edited; drawn on the rendered output in another pane, you can see them but can't edit there, and must cross-reference both sides.
 *
 * How: a StateField holds a set of Decoration.mark, fed from outside (the React side) via StateEffect.
 * When the doc changes, the RangeSet maps positions itself, so marks don't drift while typing; the next round re-aligns and replaces them.
 * The extension is attached dynamically with appendConfig when review starts; normally not a line of it enters the editor.
 */

import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { lighten, tint } from "./colors";
import type { ReviewCategory } from "./types";

/** One mark: position + which comment, which category, and whether it's the currently selected one */
export interface ReviewMark {
  from: number;
  to: number;
  id: string;
  categoryId: string;
  active: boolean;
}

/** Attribute name used to read the comment id back from the DOM when a click lands on a mark */
export const REVIEW_ID_ATTR = "data-review-id";

/** Category ids come from the server and aren't necessarily valid CSS identifiers, so sanitize before building class names */
export function markClass(categoryId: string): string {
  return `cm-review-cat-${categoryId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** Replace the whole set of marks (an empty array clears them all) */
export const setReviewMarks = StateEffect.define<readonly ReviewMark[]>();

function build(marks: readonly ReviewMark[]): DecorationSet {
  const ranges = marks
    .filter((m) => m.to > m.from)
    .slice()
    // RangeSet requires ascending start order; for equal starts put the longer first so the shorter stacks on top
    .sort((a, b) => a.from - b.from || b.to - a.to)
    .map((m) =>
      Decoration.mark({
        class: `cm-review-mark ${markClass(m.categoryId)}${m.active ? " cm-review-active" : ""}`,
        attributes: { [REVIEW_ID_ATTR]: m.id },
      }).range(m.from, m.to)
    );
  return Decoration.set(ranges, true);
}

export const reviewMarksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    // First map positions through the doc change, then see whether this transaction brings a new set
    let next = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setReviewMarks)) next = build(effect.value);
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Geometry change signal: cards align to the height of their sentence, so positions must be recomputed when line heights change.
 * docChanged is only one case; wrapping and viewport progress (distant lines switching from estimated to measured heights) move everything too.
 */
function geometrySignal(onGeometry: () => void): Extension {
  return EditorView.updateListener.of((update) => {
    if (update.geometryChanged || update.viewportChanged || update.docChanged) onGeometry();
  });
}

/**
 * Attach the marks extension to an already running editor (called once when review starts).
 *
 * appendConfig can't be detached once attached, so:
 * - guard against attaching twice (switching docs rebuilds the editor, which is a different view, so it naturally gets attached again);
 * - onGeometry must check itself whether review is still on, so it doesn't wake React after review exits.
 */
export function installReviewMarks(view: EditorView, onGeometry: () => void): void {
  if (view.state.field(reviewMarksField, false) !== undefined) return;
  view.dispatch({
    effects: StateEffect.appendConfig.of([reviewMarksField, geometrySignal(onGeometry)]),
  });
}

/** Replace the set of marks; returns false when the extension isn't attached yet (editor just rebuilt), letting the caller decide whether to attach first */
export function pushReviewMarks(view: EditorView, marks: readonly ReviewMark[]): boolean {
  if (view.state.field(reviewMarksField, false) === undefined) return false;
  view.dispatch({ effects: setReviewMarks.of(marks) });
  return true;
}

/**
 * Colors per category. Categories come with the result, so this CSS has to be generated on the fly:
 * class names only set --rv-* variables, while the underline and background rules live once in editor.css.
 * Night mode gets its own set: dark category colors are nearly invisible on a charcoal panel, so brighten first, then add the background.
 */
export function reviewMarkCss(categories: readonly ReviewCategory[]): string {
  const rules: string[] = [];
  for (const c of categories) {
    const cls = markClass(c.id);
    const dark = lighten(c.color, 0.42);
    rules.push(
      `.${cls}{--rv-color:${c.color};--rv-tint:${tint(c.color, 0.1)};--rv-tint-on:${tint(c.color, 0.22)};}`,
      `[data-theme="dark"] .${cls}{--rv-color:${dark};--rv-tint:${tint(dark, 0.16)};--rv-tint-on:${tint(dark, 0.3)};}`
    );
  }
  return rules.join("\n");
}
