import type { SyntaxNodeRef } from "@lezer/common";
import { CodeLangWidget } from "@/lib/livePreview/widgets";
import type { LpContext } from "@/lib/livePreview/context";

/**
 * Live rendering of fenced code blocks: the whole block gets a theme-tinted light card, the opening fence becomes a header bar with a language dropdown, and the closing fence collapses into bottom padding.
 *
 * The cause of the seams is worth noting: the background is painted on each line's ::before, and line heights are fractional pixels, so thin bright lines
 * leak through between adjacent lines. The fix is to extend adjacent lines' pseudo-elements by 1px up and down so they overlap (see
 * cm-lp-code-mid in the CSS); the first and last lines don't extend, to keep the rounded edges.
 */
export function fencedCodeDecorations(ctx: LpContext, node: SyntaxNodeRef): void {
  const { state } = ctx;
  ctx.codeRanges.push({ from: node.from, to: node.to });

  ctx.eachLine(node.from, node.to, (n, first, last) =>
    n === first
      ? "cm-lp-code cm-lp-code-first"
      : n === last
        ? "cm-lp-code cm-lp-code-last"
        : "cm-lp-code cm-lp-code-mid"
  );

  // The items below always pick lines by node position, unaffected by eachLine's visible-range clipping:
  // scrolled to the middle of a long code block, the opening fence is far above the viewport, and the header bar / closing padding still attach to the real first/last lines
  // (decorations outside the viewport aren't rendered anyway), so a middle line in the viewport is never mistaken for the opening fence
  const marks = node.node.getChildren("CodeMark");
  const info = node.node.getChild("CodeInfo");
  const firstLine = state.doc.lineAt(node.from);

  // Opening fence becomes the language dropdown: the ``` source is revealed only when the cursor is on that line; otherwise the line just serves as top spacing
  if (marks.length > 0 && !ctx.lineActive(firstLine.from)) {
    const lang = info ? state.sliceDoc(info.from, info.to).trim() : "";
    ctx.replaceAtomic(
      firstLine.from,
      firstLine.to,
      new CodeLangWidget(lang, marks[0].to, firstLine.to)
    );
  }

  if (marks.length < 2) return;
  const lastLine = state.doc.lineAt(marks[marks.length - 1].from);
  if (lastLine.number === firstLine.number || lastLine.from >= lastLine.to) return;
  // Once the closing fence line is hidden, its text is gone but its line height remains, leaving an extra blank line at the bottom of the block.
  // A line class squashes it into fixed-height bottom padding (can't use display:none; CodeMirror requires every line to be measurable).
  // The key is that this class is applied in both states: it used to be removed as soon as the cursor reached the closing line, so the height jumped from 12px to 22px+10px,
  // pushing everything below down by twenty-odd pixels — just for moving the cursor there, which shouldn't cause any jump.
  // Now the line box height is pinned; with the cursor on this line it isn't replaced, and ``` appears in small faint text at the same height (see CSS)
  ctx.lineClass(lastLine.from, "cm-lp-code-close");
  if (ctx.lineActive(lastLine.from)) return;
  ctx.replaceAtomic(lastLine.from, lastLine.to);
}
