/**
 * Heading folding (H1–H4): a small triangle sits at the end of the heading line; when folded, the same spot shows a "…" pill.
 *
 * Fold ranges aren't computed here. markdown() from @codemirror/lang-markdown already installs a
 * headerIndent (foldService, see node_modules/@codemirror/lang-markdown/dist/index.js),
 * whose range is exactly "end of the heading line → end of the last block node before the next same-or-higher heading":
 * - blank lines between paragraphs belong to no block node, so they naturally fall outside the fold range; after folding the next heading
 *   doesn't butt up against it and the breathing room between sections remains;
 * - `#` inside fenced code is CodeText in the syntax tree, not a heading, so it's never mistaken for a boundary.
 * So this just calls foldable() rather than building another foldService.
 *
 * The handle is a line-end widget rather than a gutter: this editor is a WYSIWYG layout with a centered text column
 * and wide side margins; adding a gutter would turn the "document" back into a "code editor". Fold and unfold both live at the line end,
 * leaving the left margin for the "## " revealed by live preview.
 * Styles in app/editor.css.
 */

import {
  EditorSelection,
  type EditorState,
  type Extension,
  type Line,
  type Range,
} from "@codemirror/state";
import {
  codeFolding,
  foldEffect,
  foldKeymap,
  foldable,
  foldedRanges,
  syntaxTree,
  unfoldEffect,
} from "@codemirror/language";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type KeyBinding,
  type ViewUpdate,
} from "@codemirror/view";
import { t } from "@/i18n/t";

/** Only H1–H4 get handles: H5/H6 already drop to body size in the layout (see cm-lp-h4 in live-preview.css),
    so another handle would just be noise; they can still be folded by shortcut, as foldable() treats all six levels alike */
const FOLDABLE_HEADING = /^ATXHeading[1-4]$/;

const SVG_NS = "http://www.w3.org/2000/svg";

interface FoldRange {
  from: number;
  to: number;
}

/** Fold ranges always start at the end of the heading line, so "is this heading folded" equals "is there a fold range at the line end" */
function foldedAt(state: EditorState, lineEnd: number): FoldRange | null {
  const hit: FoldRange[] = [];
  foldedRanges(state).between(lineEnd, lineEnd, (from, to) => {
    if (from === lineEnd) hit.push({ from, to });
  });
  return hit[0] ?? null;
}

/**
 * Whether the cursor is currently buried strictly inside a fold range; if so, returns the range start (the heading line end).
 * Strictly inside: sitting exactly on either end doesn't count; placing the cursor at from after folding is the normal finish, not a problem.
 */
function buriedCaretTarget(state: EditorState): number | null {
  const head = state.selection.main.head;
  const starts: number[] = [];
  foldedRanges(state).between(head, head, (from, to) => {
    if (from < head && to > head) starts.push(from);
  });
  return starts.length ? Math.min(...starts) : null;
}

/**
 * Common finish for fold commands: the commands don't manage the cursor, so folding may bury it inside a fold (very obvious with foldAll,
 * where the cursor vanishes on the spot). dispatch is synchronous, so check the new state right after; if buried, move the cursor to the range start.
 * This doesn't re-expand the range just folded: CodeMirror only auto-unfolds when the selection lands "strictly inside" a fold
 * (clearTouchedFolds in foldState); landing on the boundary doesn't count.
 */
function liftBuriedCaret(view: EditorView): void {
  const target = buriedCaretTarget(view.state);
  if (target !== null) view.dispatch({ selection: EditorSelection.cursor(target) });
}

/** Fold/unfold this heading line; returns false if it can't fold (empty section, or not a heading at all) */
function toggleHeadingFold(view: EditorView, line: Line): boolean {
  const folded = foldedAt(view.state, line.to);
  if (folded) {
    view.dispatch({ effects: unfoldEffect.of(folded) });
    return true;
  }
  const range = foldable(view.state, line.from, line.to);
  if (!range) return false;
  view.dispatch({ effects: foldEffect.of(range) });
  liftBuriedCaret(view);
  return true;
}

/**
 * Fold triangle at the end of a heading line. Shown only when expanded: once folded, the same spot shows the "…" pill,
 * so fold and unfold are in one place and you don't have to hunt for them.
 */
class FoldChevron extends WidgetType {
  /** Stateless widget, all identical, so the DOM is reused directly */
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const button = document.createElement("span");
    button.className = "cm-fold-chevron";
    button.title = t("折叠");
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", t("折叠这一节"));

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M4.5 6.5 8 10l3.5-3.5");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.75");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    button.append(svg);
    return button;
  }

  /** mousedown must be let through: for events returning true, CodeMirror doesn't dispatch plugin eventHandlers at all,
      so the fold handler below would never receive clicks. Other events are ignored as before so they aren't treated as text edits */
  ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown";
  }
}

/**
 * Only scan headings in the viewport. The triangle sits at the heading line end with positive side: after inline text and the cursor,
 * so a cursor at line end is drawn before the triangle and the typing position is unaffected. Line end instead of line start also
 * leaves the left margin for the "## " revealed by live preview, so they don't compete for space.
 */
function buildChevrons(view: EditorView): DecorationSet {
  const { state } = view;
  const decos: Range<Decoration>[] = [];
  let lastLineFrom = -1;
  for (const range of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        // These blocks can't contain foldable Markdown headings; in particular, don't descend into long code blocks' language syntax trees.
        if (/^(FencedCode|CodeBlock|Paragraph|Table|HTMLBlock)$/.test(node.name)) return false;
        if (!FOLDABLE_HEADING.test(node.name)) return;
        const line = state.doc.lineAt(node.from);
        // When folds split the viewport into several ranges, the same line could in theory be scanned by two adjacent ranges
        if (line.from === lastLineFrom) return;
        // Empty sections (next line is a same-or-higher heading) can't fold, so don't offer a handle that does nothing
        if (!foldable(state, line.from, line.to)) return;
        lastLineFrom = line.from;
        // Folded headings get no triangle: the "…" pill at the line end is the unfold entry
        if (foldedAt(state, line.to)) return;
        decos.push(Decoration.widget({ widget: new FoldChevron(), side: 1 }).range(line.to));
        return false;
      },
    });
  }
  return Decoration.set(decos, true);
}

const foldChevrons = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildChevrons(view);
    }

    update(update: ViewUpdate) {
      // The fold set is a StateField; when unchanged, RangeSet.map returns the old object, so a reference check suffices;
      // the syntax tree is parsed incrementally in the background, and only a new tree reveals which later lines are headings (same approach as blocks.ts)
      const foldChanged = foldedRanges(update.startState) !== foldedRanges(update.state);
      const treeChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
      if (update.docChanged || update.viewportChanged || foldChanged || treeChanged) {
        this.decorations = buildChevrons(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(event, view) {
        const target = event.target as Element | null;
        if (event.button !== 0 || !target?.closest?.(".cm-fold-chevron")) return false;
        const lineEl = target.closest(".cm-line");
        if (!lineEl) return false;
        // Must intercept: by default this would move the cursor to the line end where the triangle is and also change focus
        event.preventDefault();
        toggleHeadingFold(view, view.state.doc.lineAt(view.posAtDOM(lineEl)));
        return true;
      },
    },
  }
);

/** The "…" pill left at the heading line end after folding (the default is a gray square that doesn't fit the site's look, so it's replaced entirely) */
const foldedPlaceholder = codeFolding({
  placeholderDOM: (_view, onclick) => {
    const pill = document.createElement("span");
    pill.className = "cm-fold-pill";
    pill.textContent = "…";
    pill.title = t("点击展开");
    pill.setAttribute("role", "button");
    pill.setAttribute("aria-label", t("已折叠，点击展开"));
    // Pressing down first would put the cursor on the fold boundary and make the layout jump, so intercept it and keep only click
    pill.addEventListener("mousedown", (event) => event.preventDefault());
    pill.addEventListener("click", onclick);
    return pill;
  },
});

/**
 * Reuses the official foldKeymap (mac: ⌘⌥[ fold, ⌘⌥] unfold; ⌃⌥[ / ⌃⌥] fold/unfold all),
 * which doesn't clash with ⌘⌥0/1/2/3 in shortcuts.ts. Each command is followed by a cursor rescue.
 */
const foldKeys: KeyBinding[] = foldKeymap.map((binding) => {
  const run = binding.run;
  if (!run) return binding;
  return {
    ...binding,
    run: (view: EditorView) => {
      if (!run(view)) return false;
      liftBuriedCaret(view);
      return true;
    },
  };
});

/**
 * Fold state lives only in memory for this session and isn't persisted: foldState is a StateField,
 * and switching docs replaces the whole content, deleting the fold ranges along with it, so it clears naturally.
 * Search jumps and outline jumps both work by dispatching a selection, and CodeMirror auto-unfolds for selections inside a fold
 * (clearTouchedFolds in foldState), so no extra wiring is needed.
 */
export const headingFolding: Extension = [foldedPlaceholder, foldChevrons, keymap.of(foldKeys)];
