/** Low-level text transforms for inline and line-level formats: detect existing markup and build wrapping transactions, called by the command layer (commands.ts). */

import { EditorSelection, type ChangeSpec, type EditorState, type SelectionRange } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { EditorView } from "@codemirror/view";
import { t, tk } from "@/i18n/t";
import {
  COLOR_SPAN_CLOSE,
  COLOR_SPAN_LOOKBACK,
  COLOR_SPAN_OPEN_AT_END,
  COLOR_SPAN_WRAPPED,
  colorSpanOpen,
  colorSpanPairAt,
} from "@/lib/editor/colorSpan";

const INLINE_MARKUP = {
  "**": { node: "StrongEmphasis", mark: "EmphasisMark" },
  "*": { node: "Emphasis", mark: "EmphasisMark" },
  "~~": { node: "Strikethrough", mark: "StrikethroughMark" },
  "`": { node: "InlineCode", mark: "CodeMark" },
} as const;
type InlineMarker = keyof typeof INLINE_MARKUP;

/** Detect existing formats via syntax nodes, so the two asterisks of bold aren't mistaken for italic markers. */
function selectedMarkup(state: EditorState, range: SelectionRange, marker: InlineMarker) {
  const syntax = INLINE_MARKUP[marker];
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(range.from, 1); node; node = node.parent) {
    if (node.name !== syntax.node || node.to < range.to) continue;
    const marks = node.getChildren(syntax.mark);
    if (marks.length !== 2) continue;
    const [open, close] = marks;
    const innerSelected = range.from === open.to && range.to === close.from;
    const wholeSelected = range.from === node.from && range.to === node.to;
    if (range.empty || innerSelected || wholeSelected) return { open, close };
  }
  return null;
}

/** When the selection ends at the start of the next line, don't also format that unselected line. */
function selectedLines(state: EditorState) {
  const range = state.selection.main;
  return {
    first: state.doc.lineAt(range.from).number,
    last: state.doc.lineAt(range.empty ? range.to : range.to - 1).number,
  };
}

/** Build the transaction piece that wraps the selection, shared by plain inserts and format toggles. */
function wrapRange(state: EditorState, range: SelectionRange, before: string, after: string, placeholder: string) {
  const text = state.doc.sliceString(range.from, range.to) || placeholder;
  return {
    changes: { from: range.from, to: range.to, insert: `${before}${text}${after}` },
    range: EditorSelection.range(range.from + before.length, range.from + before.length + text.length),
  };
}

// Placeholder text inserted into the body, given in the current language (t() at insert time; the constant stores only the source text)
const LINK_TEXT = tk("链接文字");
const LINK_URL = "https://";
/** Looks like a URL, treat it as one: select an address and press Cmd+K, and it belongs in the parentheses, not as link text */
const URL_LIKE = /^(?:https?:\/\/|mailto:|www\.)\S+$/i;

/**
 * Insert a link and park the cursor on "the next slot to fill":
 * - plain text selected → the text slot is filled, so the cursor goes into the empty `()` ready to paste the address;
 * - a URL selected → the address slot is filled, so instead select the text placeholder to name the link;
 * - nothing selected → both are placeholders; select the text slot first and start with the text.
 */
export function insertLink(view: EditorView) {
  const { state } = view;
  const linkText = t(LINK_TEXT);
  view.dispatch(
    state.changeByRange((range) => {
      const text = state.doc.sliceString(range.from, range.to);
      const trimmed = text.trim();
      // `www.x.com` in the parentheses would be treated as a site-relative path, so add the protocol
      const url = URL_LIKE.test(trimmed)
        ? /^www\./i.test(trimmed)
          ? `https://${trimmed}`
          : trimmed
        : null;
      if (url) {
        const insert = `[${linkText}](${url})`;
        return {
          changes: { from: range.from, to: range.to, insert },
          range: EditorSelection.range(range.from + 1, range.from + 1 + linkText.length),
        };
      }
      if (!text) {
        const insert = `[${linkText}](${LINK_URL})`;
        return {
          changes: { from: range.from, to: range.to, insert },
          range: EditorSelection.range(range.from + 1, range.from + 1 + linkText.length),
        };
      }
      // Leave the address slot empty with a cursor (not a selection): live preview only reveals link source for a cursor,
      // a selected hidden `https://` would be invisible to the user, and the selection would draw as a gray band across the whole line
      const insert = `[${text}]()`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(range.from + text.length + "[](".length),
      };
    })
  );
  view.focus();
}

/** Add or remove an inline format; removal deletes only the delimiters, keeping content and nested formats. */
export function toggleInlineFormat(view: EditorView, marker: InlineMarker, placeholder: string) {
  const { state } = view;
  const changes = state.changeByRange((range) => {
    const marked = selectedMarkup(state, range, marker);
    if (!marked) return wrapRange(state, range, marker, marker, placeholder);
    const { open, close } = marked;
    const innerLength = close.from - open.to;
    const anchor = range.empty ? Math.max(0, Math.min(innerLength, range.head - open.to)) : 0;
    return {
      changes: [{ from: open.from, to: open.to }, { from: close.from, to: close.to }],
      range: EditorSelection.range(open.from + anchor, open.from + (range.empty ? anchor : innerLength)),
    };
  });
  view.dispatch(changes);
  view.focus();
}

/** Font color: Markdown has no color syntax, so use inline <span style="color:…">
 *  (the preview and WeChat copy paths allow this form). color null means clear color.
 *  When the selection is exactly one color span, or exactly its inner text, rewrite/strip the original tag in place to avoid nesting */
export function applyColor(view: EditorView, color: string | null) {
  const { state } = view;
  // With multiple cursors, skip the "rewrite the whole span in place" path: two cursors in the same span would produce overlapping changes,
  // and ChangeSet throws. Fall back to the old per-cursor placeholder insertion, which at least won't crash
  const single = state.selection.ranges.length === 1;
  const changes = state.changeByRange((range) => {
    let { from, to } = range;
    // Cursor inside colored text (including the two boundaries just inside the tags): in live preview the tags are hidden,
    // so to the user "the cursor is in this colored text", and recoloring/clearing should apply to the whole span,
    // not insert a "colored text" placeholder in the middle and create a nested span
    const pair = single && range.empty ? colorSpanPairAt(state, range.head) : null;
    // Empty spans skip this: they should be filled with placeholder text, which is exactly what the old logic below does
    if (pair && !pair.empty) {
      const offset = range.head - pair.open.to; // Cursor's relative position in the text, preserved after the change
      if (color === null) {
        return {
          changes: [
            { from: pair.open.from, to: pair.open.to },
            { from: pair.close.from, to: pair.close.to },
          ],
          range: EditorSelection.cursor(pair.open.from + offset),
        };
      }
      const newOpen = colorSpanOpen(color);
      return {
        changes: { from: pair.open.from, to: pair.open.to, insert: newOpen },
        range: EditorSelection.cursor(pair.open.from + newOpen.length + offset),
      };
    }
    // A pair of color tags sits right against both sides of the selection (e.g. recoloring right after coloring): expand to rewrite the tags too
    const beforeText = state.doc.sliceString(Math.max(0, from - COLOR_SPAN_LOOKBACK), from);
    const openAtLeft = beforeText.match(COLOR_SPAN_OPEN_AT_END);
    if (openAtLeft && state.doc.sliceString(to, to + COLOR_SPAN_CLOSE.length) === COLOR_SPAN_CLOSE) {
      from -= openAtLeft[0].length;
      to += COLOR_SPAN_CLOSE.length;
    }
    const text = state.doc.sliceString(from, to);
    const wrapped = text.match(COLOR_SPAN_WRAPPED);
    if (color === null && !wrapped) return { range }; // No color to clear, leave as-is
    const inner = (wrapped ? wrapped[1] : text) || t("有色文字");
    const open = color === null ? "" : colorSpanOpen(color);
    const insert = color === null ? inner : `${open}${inner}${COLOR_SPAN_CLOSE}`;
    return {
      changes: { from, to, insert },
      range: EditorSelection.range(from + open.length, from + open.length + inner.length),
    };
  });
  view.dispatch(changes);
  view.focus();
}

/**
 * Common finish for line-level commands (prefixes, headings, task items): apply the changes, mapping an empty selection with assoc=1.
 *
 * Transactions map selections with assoc=-1 by default, so a cursor right at line start (as after the slash menu deletes "/query")
 * would stay before the inserted "# ", and typing would produce "Heading# "; same for clicking the task button on an empty line, where the cursor must land
 * after the marker to keep typing. Non-empty selections use the default mapping, preserving the user's selected range.
 */
function dispatchKeepingCaret(view: EditorView, changes: ChangeSpec[], range: SelectionRange) {
  const changeSet = view.state.changes(changes);
  view.dispatch({
    changes: changeSet,
    ...(range.empty ? { selection: { anchor: changeSet.mapPos(range.head, 1) } } : {}),
  });
  view.focus();
}

export function prefixLines(view: EditorView, prefix: string) {
  const { state } = view;
  const { first, last } = selectedLines(state);
  const changes: ChangeSpec[] = [];
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    // Remove an identical existing prefix (toggle)
    if (line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: "" });
    } else {
      changes.push({ from: line.from, insert: prefix });
    }
  }
  dispatchKeepingCaret(view, changes, state.selection.main);
}

/** Swap heading levels; keeps quote, list, and indent prefixes, and reapplying the same level returns to body text. */
export function toggleHeading(view: EditorView, level: number) {
  const { state } = view;
  const { first, last } = selectedLines(state);
  const prefix = `${"#".repeat(level)} `;
  const changes: ChangeSpec[] = [];
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    const container = line.text.match(/^[ \t]*(?:>[ \t]*)*(?:(?:[-+*]|\d+[.)])[ \t]+)?/)![0];
    const existing = line.text.slice(container.length).match(/^(#{1,6})[ \t]+/);
    const from = line.from + container.length;
    changes.push({
      from,
      to: from + (existing?.[0].length ?? 0),
      insert: existing?.[1].length === level ? "" : prefix,
    });
  }
  dispatchKeepingCaret(view, changes, state.selection.main);
}

const TASK_ITEM = /^(\s*)[-*+] \[[ xX]\] /;
const BULLET_ITEM = /^\s*[-*+] /;

/** Task list toggle: already a task item → strip the marker back to plain text (checked or not);
 *  already a bullet item → add [ ] in place without another -; otherwise (including empty lines) → add the full "- [ ] ".
 *  Indentation is always kept, so nesting levels aren't flattened */
export function toggleTaskLines(view: EditorView) {
  const { state } = view;
  const { first, last } = selectedLines(state);
  const changes: ChangeSpec[] = [];
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    const task = line.text.match(TASK_ITEM);
    if (task) {
      changes.push({
        from: line.from + task[1].length,
        to: line.from + task[0].length,
        insert: "",
      });
      continue;
    }
    const bullet = line.text.match(BULLET_ITEM);
    if (bullet) {
      changes.push({ from: line.from + bullet[0].length, insert: "[ ] " });
      continue;
    }
    const indent = line.text.length - line.text.trimStart().length;
    changes.push({ from: line.from + indent, insert: "- [ ] " });
  }
  dispatchKeepingCaret(view, changes, state.selection.main);
}

export function insertBlock(view: EditorView, text: string) {
  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const needLeadingNewline = line.text.trim() !== "";
  const insert = `${needLeadingNewline ? "\n\n" : ""}${text}\n`;
  const pos = line.to;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
  });
  view.focus();
}

/**
 * Insert a callout: the cursor stops after `> [!tip] ` ready for a title; pressing Enter without one also works.
 * Doesn't reuse insertBlock: that appends a newline after the content and moves the cursor to the next line,
 * while a callout needs to keep typing on the marker line.
 */
export function insertCallout(view: EditorView, type = "tip") {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.from);
  // If the current line has text, start a new paragraph so the callout isn't attached to the end of someone else's
  const insert = `${line.text.trim() ? "\n\n" : ""}> [!${type}] `;
  const pos = line.to;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
    scrollIntoView: true,
  });
  view.focus();
}

/** Insert a fenced code block: no sample code, cursor lands on the empty line inside; with a selection, the selected text goes inside the block */
export function insertCodeBlock(view: EditorView): void {
  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  if (!range.empty) {
    // Selected text goes straight into the fence; only start a new line when body text precedes the selection, to avoid a spurious blank line
    const body = state.sliceDoc(range.from, range.to);
    const head = `${line.text.slice(0, range.from - line.from).trim() ? "\n" : ""}\`\`\`\n`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: `${head}${body}\n\`\`\`\n` },
      selection: { anchor: range.from + head.length + body.length },
      scrollIntoView: true,
    });
    view.focus();
    return;
  }
  // Empty selection: like insertBlock, lands at line end with the cursor on the blank line between the opening and closing fences, ready to write
  const head = `${line.text.trim() ? "\n\n" : ""}\`\`\`\n`;
  const pos = line.to;
  view.dispatch({
    changes: { from: pos, insert: `${head}\n\`\`\`\n` },
    selection: { anchor: pos + head.length },
    scrollIntoView: true,
  });
  view.focus();
}

/** Insert a table skeleton; a function so header / cell placeholders use the language at insert time */
export function tableTemplate(): string {
  const head = t("表头");
  const cell = t("内容");
  return `| ${head} | ${head} |\n| --- | --- |\n| ${cell} | ${cell} |\n| ${cell} | ${cell} |`;
}
