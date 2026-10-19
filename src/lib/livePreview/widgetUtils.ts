import type { EditorView } from "@codemirror/view";

/** Small helpers shared by live-preview widgets (click to edit). The widgets live in widgets.ts / blockWidgets.ts /
 *  frontmatterWidget.ts and share this behavior verbatim, so it lives in one place. */

/**
 * Clicking a widget means "I want to edit": put the cursor inside the syntax (source is revealed only when strictly inside the range).
 *
 * - offset: chars to skip past the opening marker (`![` is 2, `$$` is 2, a rule is 1, a table row's leading `|` is 1...),
 *   so the cursor lands inside the range and the decoration yields to source (images/videos now check boundaries, so this
 *   is no longer required to reveal them, but we still use 2 to land in the alt text: typing edits the caption instead of eating the `!`)
 * - anchor: the posAtDOM anchor, defaulting to the element with the listener. The video player bar swallows all clicks,
 *   so the edit entry must sit on the caption below, while the position is resolved via the outer container; hence they can differ
 * - table cells also carry data-source-offset: the cursor lands in the clicked cell, taking precedence over offset
 */
export function editOnClick(
  el: HTMLElement,
  view: EditorView,
  offset: number,
  anchor: HTMLElement = el
) {
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = view.posAtDOM(anchor);
    const cell = (e.target as Element).closest<HTMLElement>("[data-source-offset]");
    const target = cell ? Number(cell.dataset.sourceOffset) : offset;
    view.dispatch({ selection: { anchor: pos + target }, scrollIntoView: true });
    view.focus();
  });
}
