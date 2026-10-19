import { syntaxTree } from "@codemirror/language";
import { RangeSet, type EditorState, type Extension } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { BulletWidget, CalloutBadgeWidget, CheckboxWidget } from "@/lib/livePreview/widgets";
import { calloutStyle, parseCalloutHead } from "@/lib/callout";
import { ATTACHMENTS_RESOLVED_EVENT } from "@/lib/localBackend/attachmentUrls";
import {
  caretAtStartOrInside,
  caretInFencedCode,
  caretPositions,
  caretTouches,
  createLpContext,
  hasTextSelection,
  inCodeRanges,
  refreshLivePreview,
  visibleLineRanges,
  type LpContext,
} from "@/lib/livePreview/context";
import { INLINE_NODE_NAMES, inlineDecorations, linkTargetAt } from "@/lib/livePreview/inline";
import { scanVisibleLines } from "@/lib/livePreview/lineScan";
import { inlineMathLine } from "@/lib/livePreview/inlineMath";
import { footnoteDefLine, isFootnoteDefLine } from "@/lib/livePreview/footnote";
import { fencedCodeDecorations } from "@/lib/livePreview/fence";
import { fenceKeymap } from "@/lib/livePreview/fenceKeys";
import { livePreviewBlocks, renderedBlockRanges } from "@/lib/livePreview/blocks";
import { colorSpanKeys } from "@/lib/editor/colorSpanKeys";
import { requestOpenWikiLink } from "@/lib/wikiLink";

/**
 * Live rendering (like Obsidian Live Preview) — node-level reveal strategy:
 * hide syntax markers and render images/quotes/task lists inline, but reveal per "syntax node" rather than "whole line",
 * so passive cursor movement (arrowing past, click positioning) never shifts the text:
 * - inline markers (**, `, ~~, links): shown only when the cursor enters that syntax range, so shifts happen only at the focus point
 * - line-start markers (#, >): take no space when the cursor isn't on the line; on the line they hang in a zero-width box outside the text's left edge,
 *   so the text's left edge stays put in both states
 * - whole widgets (images/video/dividers/tables/math): source expands as soon as the cursor touches either boundary (clicking the widget
 *   or arrowing past both count); otherwise atomicRanges makes the cursor skip over them; when an image expands its source shows as-is
 *   and the image moves below the source — if the image vanished, the layout would collapse (see the Image branch in inline.ts).
 *   Always cursor only, never sweeping selections: if ⌘A/drag burst every widget into source, the whole layout would jump
 * - task lists: `- ` is always hidden, `[ ]` appears only when the cursor enters the marker, so Home/← to line start causes zero shift
 *
 * Multi-line replacements (tables, $$ math) aren't in this plugin — CodeMirror forbids plugins from providing multi-line replace;
 * see the state field in blocks.ts.
 */

/** Line-start marker (#, >) plus its trailing space: hidden entirely off the focus line, shown small and faint gray on it */
function headMark(ctx: LpContext, from: number, to: number) {
  const end = ctx.state.sliceDoc(to, to + 1) === " " ? to + 1 : to;
  if (from >= end) return;
  if (ctx.lineActive(from)) {
    // Box width is fixed by character count (monospace), and CSS uses a negative margin to hang it outside the text's left edge
    ctx.decos.push(
      Decoration.mark({
        class: "cm-lp-mark",
        attributes: { style: `--lp-mark:${end - from}ch` },
      }).range(from, end)
    );
  } else {
    ctx.hide(from, end);
  }
}

/** Prefix decorations on a list item's first line:
 *  - each ancestor item's indent segment gets cm-lp-indent, sized by char count (N ch), recording its start column as --lp-col,
 *    which CSS uses to draw the guide line right below the ancestor's bullet;
 *  - the space after the bullet gets cm-lp-gap (fixed 1ch), so the prefix's total width is exactly "prefix chars × 1ch";
 *  - the line-level cm-lp-hang records the prefix width as --lp-hang, which CSS uses for hanging indent so wrapped lines align with the text.
 *  When one line has both outer and inner markers (e.g. "- - a"), the prefix isn't pure whitespace, so none of this is applied. */
function listPrefix(ctx: LpContext, state: EditorState, item: SyntaxNode) {
  const mark = item.getChild("ListMark");
  if (!mark) return;
  const line = state.doc.lineAt(mark.from);
  if (!/^\s*$/.test(state.sliceDoc(line.from, mark.from))) return;
  const ownCol = mark.from - line.from;
  const cols: number[] = [];
  for (let p = item.parent; p; p = p.parent) {
    if (p.name !== "ListItem") continue;
    const pm = p.getChild("ListMark");
    if (pm) cols.push(pm.from - state.doc.lineAt(pm.from).from);
  }
  cols.sort((a, b) => a - b);
  cols.forEach((from, i) => {
    const to = cols[i + 1] ?? ownCol;
    if (to <= from) return;
    ctx.decos.push(
      Decoration.mark({
        class: "cm-lp-indent",
        attributes: { style: `--lp-col:${from};min-width:${to - from}ch` },
      }).range(line.from + from, line.from + to)
    );
  });
  const task = /^ \[[ xX]\]/.test(state.sliceDoc(mark.to, mark.to + 4));
  const hasGap = !task && state.sliceDoc(mark.to, mark.to + 1) === " ";
  if (hasGap) {
    ctx.decos.push(Decoration.mark({ class: "cm-lp-gap" }).range(mark.to, mark.to + 1));
  }
  // A task item's "- " is hidden entirely and the checkbox width isn't a whole number of ch, so wrapped lines only align to the indent
  const hang = task ? ownCol : mark.to - line.from + (hasGap ? 1 : 0);
  if (hang > 0) {
    ctx.decos.push(
      Decoration.line({ class: "cm-lp-hang", attributes: { style: `--lp-hang:${hang}ch` } }).range(
        line.from
      )
    );
  }
}

/**
 * Callouts (`> [!tip] Title`): the whole block is colored by type, and the `[!tip]` marker on the first line becomes a type badge.
 * Returns true on match so the caller skips normal quote handling; the QuoteMark branch is unaffected,
 * and each line's `>` is still taken by headMark.
 */
function calloutDecorations(ctx: LpContext, from: number, to: number): boolean {
  const { state } = ctx;
  const line = state.doc.lineAt(from);
  // Slice from `>` to line end and strip one marker level: in nested quotes (`> > [!tip]`) only the inner node can match;
  // the outer one still starts with `>` after stripping one, so it naturally falls back to a normal quote
  const rest = state.sliceDoc(from, line.to);
  const quote = /^>[ \t]?/.exec(rest);
  if (!quote) return false;
  const head = parseCalloutHead(rest.slice(quote[0].length));
  if (!head) return false;

  ctx.eachLine(from, to, () => `cm-lp-quote cm-lp-callout cm-lp-callout-${head.type}`);

  const markFrom = from + quote[0].length;
  const markTo = markFrom + head.markEnd;
  // A custom title is just bolded, not replaced: glyph widths don't change as the cursor enters/leaves, so the first line doesn't jump
  if (head.custom) {
    let titleStart = quote[0].length + head.markEnd;
    while (titleStart < rest.length && (rest[titleStart] === " " || rest[titleStart] === "\t")) {
      titleStart++;
    }
    if (from + titleStart < line.to) {
      ctx.decos.push(
        Decoration.mark({ class: "cm-lp-callout-title" }).range(from + titleStart, line.to)
      );
    }
  }
  // Not replaced when the cursor or selection is on the first line: same rule as line-start markers (#, >) — to change the type you need to see the source
  if (!ctx.lineActive(line.from)) {
    ctx.decos.push(
      Decoration.replace({
        widget: new CalloutBadgeWidget(calloutStyle(head.type).title),
      }).range(markFrom, markTo)
    );
  }
  return true;
}

/** Blank lines keep a uniform height, including the cursor line; moving the cursor mustn't push the text below. */
function scanBlankLines(ctx: LpContext, view: EditorView) {
  const { state } = ctx;
  const blocks = renderedBlockRanges(state);
  for (const range of view.visibleRanges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) {
      const line = state.doc.line(n);
      if (line.length !== 0) continue;
      // Blank lines in code blocks are part of the code; lines replaced by block widgets aren't shown at all
      if (inCodeRanges(ctx.codeRanges, line.from) || inCodeRanges(blocks, line.from)) continue;
      ctx.lineClass(line.from, "cm-lp-blank");
    }
  }
}

interface Built {
  decorations: DecorationSet;
  /** Replaced ranges currently rendered as widgets (images/video/dividers/fence lines): the cursor skips them whole and never lands inside */
  atomics: DecorationSet;
}

/** Uses only the view's state and visibleRanges; unit tests drive it with a minimal fake view (see tests/livePreview) */
export function buildDecorations(view: EditorView, caret: number[]): Built {
  const { state } = view;
  // Line decorations cover only the visible range: quotes/lists/fenced blocks can run thousands of lines, and as soon as one line hit the viewport
  // we used to lay out the whole block line by line (3,000-line code block = 3,000 line decorations), redone on every cursor move
  const ctx = createLpContext(state, caret, visibleLineRanges(state, view.visibleRanges));

  // First the two things scanned line by line from source: inline math `$…$` (lezer doesn't know `$`) and footnote definition lines.
  // Math must come before the syntax tree pass — the found ranges have to be registered in ctx first,
  // so the `*` and `[` inside aren't hidden again as Markdown markers (see inMath in context.ts)
  scanVisibleLines(view, (line, guards) => {
    inlineMathLine(ctx, view, line, guards);
    footnoteDefLine(ctx, line, guards);
  });

  for (const range of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        const { name } = node;
        // A footnote definition line `[^id]: text` whose content has no spaces is parsed by lezer as a whole-line link reference definition,
        // with the content becoming a URL node. Skip the whole subtree: the leading label is already a small badge via footnoteDefLine,
        // and descending would just color the text as an unclickable fake link
        if (name === "LinkReference" && isFootnoteDefLine(state, node.from)) return false;
        if (INLINE_NODE_NAMES.has(name)) return inlineDecorations(ctx, node);

        if (/^ATXHeading[1-6]$/.test(name)) {
          // Heading line styles (per-level font size, block spacing) — static classes, independent of the cursor
          const level = Math.min(4, Number(name.slice(-1)));
          const line = state.doc.lineAt(node.from);
          ctx.lineClass(line.from, `cm-lp-h${level}`);
          // When the doc's first line is a heading there's no text above to push away, so the top spacing is fixed (see cm-lp-first),
          // making the gap from the title input to the body H1 exactly 16px
          if (line.number === 1) ctx.lineClass(line.from, "cm-lp-first");
          const mark = node.node.getChild("HeaderMark");
          if (mark) headMark(ctx, mark.from, mark.to);
          return;
        }
        // Setext underline headings need no handling: the markdown extension already has remove: ["SetextHeading"]
        // (see src/lib/editor/extensions.ts), so these two nodes never appear in the tree
        if (name === "Blockquote") {
          if (calloutDecorations(ctx, node.from, node.to)) return;
          ctx.eachLine(node.from, node.to, () => "cm-lp-quote");
          return;
        }
        if (name === "QuoteMark") {
          headMark(ctx, node.from, node.to);
          return;
        }
        if (name === "ListItem") {
          // List line spacing is a notch tighter than body text: items are short, and body spacing would look loose
          ctx.eachLine(node.from, node.to, () => "cm-lp-li");
          listPrefix(ctx, state, node.node);
          return;
        }
        if (name === "FencedCode") {
          fencedCodeDecorations(ctx, node);
          // Code highlighting is handled by a separate extension; live layout only handles fences and line backgrounds, without walking embedded language trees.
          return false;
        }
        if (name === "ListMark") {
          const listType = node.node.parent?.parent?.name;
          if (listType === "OrderedList") {
            // The number stays as editable source, just muted into a monospace label; box width is fixed by char count so the prefix width can be computed exactly
            ctx.decos.push(
              Decoration.mark({
                class: "cm-lp-olnum",
                attributes: { style: `min-width:${node.to - node.from}ch` },
              }).range(node.from, node.to)
            );
            return;
          }
          if (listType !== "BulletList") return;
          if (/^ \[[ xX]\]/.test(state.sliceDoc(node.to, node.to + 4))) {
            // A task item's "- " is always hidden entirely, even with the cursor at line start / after "-" / before "[": the checkbox stands in for
            // "[ ]", and "- " has no counterpart in the rendered form, so revealing it is a net 2ch shift — that's exactly how pressing Home
            // used to shove the whole line two columns right. The cursor at these three positions is drawn at the same spot anyway, so there's no visible difference;
            // the marker can still be deleted or edited, and once it's no longer a task item the line falls back to source, so feedback is visible
            ctx.hide(node.from, node.to + 1);
            return;
          }
          if (caretTouches(caret, node.from, node.to)) {
            // With the cursor on this line the original "-" shows, also 1ch (same width as the bullet), so entering/leaving the line shifts nothing
            ctx.decos.push(Decoration.mark({ class: "cm-lp-rawmark" }).range(node.from, node.to));
            return;
          }
          // Nesting depth decides the bullet style (filled/hollow/square cycle), matching Notion's hierarchy vocabulary
          let depth = 0;
          for (let p = node.node.parent; p; p = p.parent)
            if (p.name === "BulletList" || p.name === "OrderedList") depth++;
          const level = ((depth - 1) % 3) + 1;
          ctx.decos.push(
            Decoration.replace({ widget: new BulletWidget(level) }).range(node.from, node.to)
          );
          return;
        }
        if (name === "TaskMarker") {
          // Left-closed, right-open (caretAtStartOrInside): the cursor after `]` still shows the checkbox — that's where ← from the
          // first text character lands and the most common resting spot; including the right boundary would flip the checkbox to
          // `[x]` text on a single left arrow and make the line jump. Source appears only before `[` or inside the brackets, i.e. deliberately editing the marker
          if (!caretAtStartOrInside(caret, node.from, node.to)) {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to));
            ctx.decos.push(
              Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to)
            );
          }
          return;
        }
      },
    });
  }

  scanBlankLines(ctx, view);

  return {
    decorations: Decoration.set(ctx.decos, true),
    atomics: Decoration.set(ctx.atomics, true),
  };
}

/** In the dark terminal card an ink-colored cursor disappears, so swap in a light solid cursor; the cursor layer is a separate absolutely positioned layer,
    and CSS can't target "the cursor inside a code block", so we have to put a marker class on the editor root.
    The root's marker class must go through editorAttributes, not manual classList: CodeMirror syncs root attributes
    with a whole-string setAttribute("class"), so any attribute recompute elsewhere (e.g. a selection-state class toggle) wipes manually added classes
    — that's how the cursor "vanished" inside code blocks: the class got wiped and the ink cursor hid in the charcoal card */
const caretInCodeAttr = EditorView.editorAttributes.compute(["selection", "doc"], (state) => ({
  class: caretInFencedCode(state) ? "cm-caret-in-code" : "",
}));

/**
 * Signals that unfreeze the drag-selection layout. Beyond mouseup we need extra safeguards: releasing outside the window or switching apps mid-drag
 * means mouseup is never dispatched to this window, so the freeze flag stays forever — after that no cursor move rebuilds decorations,
 * and live rendering looks "stuck". blur (including element focus loss in the capture phase), the next pointerdown
 * (fires before mousedown per spec, so it won't hit the current gesture), and the next keydown each act as a backstop.
 */
const SELECTION_END_EVENTS = ["mouseup", "blur", "pointerdown", "keydown"] as const;

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomics: DecorationSet;
    private caret: number[];
    private selectingWithMouse = false;
    private removeMouseListeners: (() => void) | null = null;

    constructor(view: EditorView) {
      this.caret = caretPositions(view.state);
      const built = buildDecorations(view, this.caret);
      this.decorations = built.decorations;
      this.atomics = built.atomics;
    }

    update(update: ViewUpdate) {
      const forced = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(refreshLivePreview))
      );

      // Doc changes invalidate old positions; single-cursor moves switch which syntax nodes reveal source.
      if (
        update.docChanged ||
        (update.selectionSet && !this.selectingWithMouse && !hasTextSelection(update.state))
      ) {
        this.caret = caretPositions(update.state);
      }

      // Don't rebuild decorations on selectionSet during mouse drag-select (layout frozen to avoid mid-drag jumps);
      // keyboard extend/select-all must rebuild: when the selection reaches fence lines the hidden ``` source must appear.
      // On viewport changes, still fill in decorations for newly visible lines using the frozen cursor position.
      const selectionNeedsRebuild = update.selectionSet && !this.selectingWithMouse;
      // When background parsing completes, text and viewport may be unchanged, but newly recognized Markdown still needs relayout.
      const treeChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
      if (update.docChanged || update.viewportChanged || selectionNeedsRebuild || treeChanged || forced) {
        const built = buildDecorations(update.view, this.caret);
        this.decorations = built.decorations;
        this.atomics = built.atomics;
      }
    }

    beginMouseSelection(view: EditorView) {
      if (this.selectingWithMouse) return;
      const win = view.dom.ownerDocument.defaultView;
      if (!win) return;

      this.selectingWithMouse = true;
      const finish = () => this.finishMouseSelection(view);
      for (const type of SELECTION_END_EVENTS) win.addEventListener(type, finish, true);
      this.removeMouseListeners = () => {
        for (const type of SELECTION_END_EVENTS) win.removeEventListener(type, finish, true);
      };
    }

    private finishMouseSelection(view: EditorView) {
      if (!this.selectingWithMouse) return;
      this.selectingWithMouse = false;
      this.removeMouseListeners?.();
      this.removeMouseListeners = null;

      // After a click positions the cursor, reveal by node; also recompute when a drag/double-click ends,
      // so fence lines covered by the selection show their source (layout stays frozen during the drag).
      // Caret positions update only on empty selections: keep the reveal state from before selecting so nothing jumps afterwards.
      if (!hasTextSelection(view.state)) this.caret = caretPositions(view.state);
      view.dispatch({ effects: refreshLivePreview.of(null) });
    }

    destroy() {
      this.removeMouseListeners?.();
      this.removeMouseListeners = null;
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(event, view) {
        const target = event.target as Element | null;
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          target?.closest?.(".cm-lp-checkbox")
        ) {
          return;
        }
        this.beginMouseSelection(view);
      },
    },
  }
);

/**
 * Attachment images in the local library are read asynchronously: each loaded batch triggers an empty transaction,
 * and on decoration rebuild the image widget gets the new object URL (src changed, eq fails, so the widget rebuilds).
 */
const attachmentRefresh = ViewPlugin.define((view) => {
  const onResolved = () => view.dispatch({ effects: refreshLivePreview.of(null) });
  window.addEventListener(ATTACHMENTS_RESOLVED_EVENT, onResolved);
  return {
    destroy() {
      window.removeEventListener(ATTACHMENTS_RESOLVED_EVENT, onResolved);
    },
  };
});

export const livePreview: Extension = [
  livePreviewPlugin,
  attachmentRefresh,
  caretInCodeAttr,
  livePreviewBlocks,
  // Widgets are skipped whole: when arrowing past, the cursor stops at the boundaries and never lands in the replaced source.
  // Only ranges currently rendered as widgets are registered — once the cursor touches and expands the source, that span is no longer atomic,
  // so delete keys go character by character (one backspace removes a single `-`, rather than the whole divider silently vanishing)
  EditorView.atomicRanges.of((view) => view.plugin(livePreviewPlugin)?.atomics ?? RangeSet.empty),
  EditorView.editorAttributes.of({ class: "cm-live-preview" }),
  EditorView.domEventHandlers({
    // Modifier-click on a link: intercept mousedown first, otherwise CodeMirror has already put the cursor in the link
    // (the source bursts open, and ⌘ might add an extra cursor), and by the time click opens it the layout has already jumped
    mousedown: (e) => {
      if (!linkTargetAt(e)) return false;
      e.preventDefault();
      return true;
    },
    // Open on click rather than mousedown: drag-selecting from link text only fires mousedown,
    // and the browser won't dispatch click before release, so a drag never navigates by mistake
    click: (e) => {
      const target = linkTargetAt(e);
      if (!target) return false;
      if (target.wiki) requestOpenWikiLink(target.wiki);
      // noopener is required: otherwise the new window could manipulate this page via opener
      else if (target.href) window.open(target.href, "_blank", "noopener");
      e.preventDefault();
      return true;
    },
  }),
  // Delete-key takeover for fenced code blocks: opening/closing fence lines are atomic, and default deletion would punch through ```
  fenceKeymap,
  // Same for color spans: the opening/closing tags are usually hidden and atomic, so delete keys skip them and clean up orphans when half is deleted
  colorSpanKeys,
];
