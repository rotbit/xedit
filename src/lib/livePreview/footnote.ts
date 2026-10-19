import type { SyntaxNode } from "@lezer/common";
import type { EditorState, Text } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";
import { blockGuardRanges } from "@/lib/livePreview/blocks";
import { caretTouches, type LpContext } from "@/lib/livePreview/context";
import type { ScanGuards, ScanLine } from "@/lib/livePreview/lineScan";

/**
 * Live rendering of footnotes: references `[^id]` in the body and definition lines `[^id]: text` at the end.
 *
 * Recognition rules match markdown-it-footnote (the one registered in renderer.ts):
 * - labels are non-empty with no spaces; definition lines are indented at most 3 spaces, and `]` must be followed immediately by `:`;
 * - a reference only counts if the doc actually has a definition with that name (the plugin's footnote_ref checks env.footnotes.refs
 *   and outputs plain text if not found). Same here: an undefined `[^x]` stays as source,
 *   so the editor doesn't show a superscript while the export still shows four bracket characters.
 *
 * Two places must cooperate with the link branch (see wiring in inline.ts / index.ts): lezer doesn't know footnotes,
 * so `[^id]` parses as a Link without a URL, and a definition line whose content has no spaces parses entirely as a
 * LinkReference (the content becomes a URL node, which would be colored as a bare link if not intercepted). Decorating both would stack
 * two replaces on the same span — and CodeMirror throws on overlapping replace decorations.
 */

/** Definition line: `[^id]:` at line start (indent ≤3). Same rules as markdown-it-footnote's footnote_def */
const DEF_LINE = /^ {0,3}\[\^([^\s\]]+)\]:/;
/** Reference: the whole node is exactly `[^id]` (one followed by `(` or `[` is a normal link, and the node would be longer) */
const REF_TEXT = /^\[\^([^\s\]]+)\]$/;

/** The `[^` and `]` revealed when the cursor touches; shares the faded style with inline markers in inline.ts */
const FN_MARK = Decoration.mark({ class: "cm-lp-mark-inline" });
/** Rendered reference: superscript, accent color, slightly smaller font */
const REF_MARK = Decoration.mark({ class: "cm-lp-fn-ref" });

/**
 * Set of definition labels for the whole doc. Cached per doc: CodeMirror's Text is immutable, so however the cursor moves within the same doc
 * the same result is reused; it's recomputed only when text actually changes.
 * It's also only called when a `[^id]` shape actually appears in the visible range (see footnoteRef),
 * so documents without footnotes are never scanned.
 */
const labelCache = new WeakMap<Text, Set<string>>();

function footnoteLabels(state: EditorState): Set<string> {
  const cached = labelCache.get(state.doc);
  if (cached) return cached;
  const labels = new Set<string>();
  const skip = blockGuardRanges(state);
  let pos = 0;
  for (const text of state.doc.iterLines()) {
    // includes as a first filter: in long docs most lines don't even contain `[^`, no need to run the regex
    if (text.includes("[^")) {
      const match = text.match(DEF_LINE);
      // `[^x]:` inside code blocks/tables isn't a definition, nor is it on export
      if (match && !skip.some((r) => pos >= r.from && pos <= r.to)) labels.add(match[1]);
    }
    pos += text.length + 1;
  }
  labelCache.set(state.doc, labels);
  return labels;
}

/** Whether this line is a footnote definition line (the leading label is handled by footnoteDefLine; the line no longer goes through the link path) */
export function isFootnoteDefLine(state: EditorState, pos: number): boolean {
  return DEF_LINE.test(state.doc.lineAt(pos).text);
}

/**
 * The leading `[^id]:` of a definition line: when the cursor/selection isn't on this line it shrinks to a small, muted `id.`.
 * A widget is used instead of hiding source because the rendered form adds a dot (`1.` reads as the item number),
 * a character that isn't in the source.
 */
class FootnoteDefWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(other: FootnoteDefWidget) {
    return other.label === this.label;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-lp-fn-def";
    el.textContent = `${this.label}.`;
    return el;
  }
  ignoreEvent() {
    // Clicking it should put the cursor back at the label to edit the id; let CodeMirror handle positioning
    return false;
  }
}

/**
 * A reference `[^id]` in the body. Returns true if footnotes took this over, and the link branch must stop here.
 *
 * Three cases count as taken over: normal rendering, source revealed when the cursor touches, and "right shape but no definition" —
 * the last draws nothing, precisely so the four characters `[^1]` stay as-is. If handed back to the link branch,
 * it would hide `[` and `]`, leaving a lone `^1` that nobody could make sense of.
 */
export function footnoteRef(ctx: LpContext, node: SyntaxNode): boolean {
  const { state } = ctx;
  const match = state.sliceDoc(node.from, node.to).match(REF_TEXT);
  if (!match) return false;
  const line = state.doc.lineAt(node.from);
  // The `[^id]` at the start of a definition line isn't a reference (it's replaced, together with the following `:`, by a small label)
  if (isFootnoteDefLine(state, node.from) && node.from - line.from === line.text.indexOf("[")) {
    return true;
  }
  if (!footnoteLabels(state).has(match[1])) return true;
  if (caretTouches(ctx.caret, node.from, node.to)) {
    ctx.decos.push(FN_MARK.range(node.from, node.from + 2), FN_MARK.range(node.to - 1, node.to));
    return true;
  }
  ctx.hide(node.from, node.from + 2);
  ctx.hide(node.to - 1, node.to);
  ctx.decos.push(REF_MARK.range(node.from + 2, node.to - 1));
  return true;
}

/**
 * Definition line `[^id]: text`: the leading label becomes a small `id.`, and the content renders as usual.
 * Reveal uses lineActive (cursor or selection on this line) — it's a line-start marker, same tier as `#` and `>`,
 * not an inline element that follows the cursor.
 */
export function footnoteDefLine(ctx: LpContext, line: ScanLine, guards: ScanGuards): void {
  const match = line.text.match(DEF_LINE);
  if (!match) return;
  const from = line.from + match[0].indexOf("[");
  const to = line.from + match[0].length;
  if (guards.inBlock(from, to)) return;
  // When the label contains math (an odd form like `[^$x$]:`) the math has already claimed this span:
  // two stacked replaces make CodeMirror throw, so yield to the math and keep the label as source
  if (ctx.mathRanges.some((r) => from < r.to && to > r.from)) return;
  if (ctx.lineActive(line.from)) return;
  ctx.decos.push(Decoration.replace({ widget: new FootnoteDefWidget(match[1]) }).range(from, to));
}
