import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { Decoration } from "@codemirror/view";
import { isAttachmentSrc, resolveAttachmentSrc } from "@/lib/localBackend/attachmentUrls";
import { isVideoUrl, posterFromTitle } from "@/lib/media";
import { HrWidget, ImageWidget, VideoWidget } from "@/lib/livePreview/widgets";
import { footnoteRef } from "@/lib/livePreview/footnote";
import { caretTouches, type LpContext } from "@/lib/livePreview/context";
import { colorSpanPairFromOpen } from "@/lib/editor/colorSpan";
import { t, tk } from "@/i18n/t";

/**
 * Live-render branches for inline syntax (emphasis, inline code, strikethrough, links, color spans, images/video, dividers).
 * Pulled out of livePreview/index.ts only to keep file length in check; the rule is consistent throughout:
 * markers show only when the cursor enters that syntax range, so shifts happen only at the focus point.
 *
 * Color spans are the only exception: their tags stay hidden even with the cursor inside (see the HTMLTag branch below).
 * Other inline markers are two or three chars, so revealing them shifts little, and they really do get hand-edited (`**` to `*`);
 * a color opening tag is thirty-plus chars, so entering it would shove the line far right with a chunk of code in it,
 * and users never want to edit that style — the toolbar changes colors, and source mode shows the source.
 *
 * Link click semantics (protocol allowlist, ⌘/Ctrl+click to open) also live here — this file produces data-lp-href,
 * so "which URLs are clickable" and "what clicking does" stay together and changing one won't miss the other.
 */

/**
 * Markers revealed when the cursor enters inline syntax (**, *, ~~, `).
 * Revealing them at full size pushes the line's text far right and makes the whole line look like it's shaking; shrinking to 0.75em and tightening letter spacing
 * leaves just over half the original footprint, halving the jitter. line-height is a unitless inherited value
 * that scales with the font size here, so line height is unaffected and there's no vertical jump.
 */
const INLINE_MARK = Decoration.mark({ class: "cm-lp-mark-inline" });

/** On Mac, Ctrl+click is a right click (opens the context menu), so opening links only accepts ⌘; other platforms only accept Ctrl.
    Computing it once at module level is enough: every decoration rebuild builds the hint string and every click checks modifiers */
const IS_MAC = typeof navigator === "undefined" || /Mac|iPhone|iPad/i.test(navigator.userAgent);
const OPEN_HINT = IS_MAC ? tk("⌘ + 点击打开") : tk("Ctrl + 点击打开");

/** Protocols allowed through to window.open: anything else (javascript:, data:, vbscript: …) means one click runs someone else's code
    in our page, and document content may come from import/share/collaboration, so it must be blocked at the render layer —
    links that fail this don't even get data-lp-href, so they can't open and get no pointer cursor; they don't look clickable */
const SAFE_SCHEME = /^(?:https?|mailto|tel):/i;

/** Returns a safe-to-open URL if allowed, null if blocked. Relative paths/anchors without a protocol are always allowed */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return SAFE_SCHEME.test(href) ? href : null;
  return href;
}

/** Click target of a rendered link: href for external links, wiki title for [[wikilinks]] */
export interface LinkTarget {
  readonly href?: string;
  readonly wiki?: string;
}

/**
 * Get the navigation target when ⌘/Ctrl+click lands on a rendered link; null in all other cases.
 * Click = position the cursor (left to CodeMirror's default, which then reveals source for editing), ⌘/Ctrl+click = open,
 * matching Obsidian/Typora: rendered link text is body text first, and clicking it usually means wanting to edit there.
 */
export function linkTargetAt(e: MouseEvent): LinkTarget | null {
  if (e.button !== 0 || !(IS_MAC ? e.metaKey : e.ctrlKey)) return null;
  const dom = e.target as HTMLElement | null;
  const raw = dom?.closest?.("[data-lp-href]")?.getAttribute("data-lp-href");
  if (raw) {
    // The decoration attribute is just a string in the DOM; it was filtered at render time, but verify again before opening
    const href = safeHref(raw);
    return href ? { href } : null;
  }
  const wiki = dom?.closest?.("[data-lp-wiki]")?.getAttribute("data-lp-wiki");
  return wiki ? { wiki } : null;
}

/** Apply the shrunken, faded style to a set of marker nodes (empty ranges are rejected by RangeSet, so filter them first) */
function softenMarks(ctx: LpContext, marks: readonly SyntaxNode[]) {
  for (const m of marks) if (m.from < m.to) ctx.decos.push(INLINE_MARK.range(m.from, m.to));
}

/** Node names dispatched here by livePreview's decoration building */
export const INLINE_NODE_NAMES = new Set([
  "Emphasis",
  "StrongEmphasis",
  "HTMLTag",
  "InlineCode",
  "Strikethrough",
  "Link",
  "URL",
  "Image",
  "HorizontalRule",
  "WikiLink",
]);

/** Returning false means don't descend into children (same convention as CodeMirror's iterate) */
export function inlineDecorations(ctx: LpContext, node: SyntaxNodeRef): false | void {
  const { state, caret } = ctx;
  const { name } = node;

  if (name === "Emphasis" || name === "StrongEmphasis") {
    const marks = node.node.getChildren("EmphasisMark");
    if (caretTouches(caret, node.from, node.to)) softenMarks(ctx, marks);
    else for (const m of marks) ctx.hide(m.from, m.to);
    return;
  }

  if (name === "HTMLTag") {
    // <span style="color:…">…</span> written by the toolbar font color: both tags are always hidden and the text between is colored,
    // whether or not the cursor is in range (Notion/Feishu-style "color is an attribute, not code"). Tags are registered as atomic,
    // so arrow keys skip them whole; with the cursor in colored text you can edit directly, and delete keys are handled by editor/colorSpanKeys.ts.
    const pair = colorSpanPairFromOpen(state, node.node);
    if (!pair) return;
    // Nothing in between: hiding it would leave invisible, undeletable junk, so show the source as-is for the user to handle
    // (if it's truly emptied, colorSpanKeys' fallback cleanup removes the empty tag pair)
    if (pair.empty) return;
    // Hide both or neither: inline math ranges are silently rejected by hide, and hiding just one end would leave a lone tag in the text
    if (ctx.inMath(pair.open.from, pair.open.to) || ctx.inMath(pair.close.from, pair.close.to)) {
      return;
    }
    ctx.replaceAtomic(pair.open.from, pair.open.to);
    ctx.replaceAtomic(pair.close.from, pair.close.to);
    ctx.decos.push(
      Decoration.mark({ attributes: { style: `color:${pair.color}` } }).range(
        pair.open.to,
        pair.close.from
      )
    );
    return;
  }

  if (name === "InlineCode") {
    const marks = node.node.getChildren("CodeMark");
    if (caretTouches(caret, node.from, node.to)) {
      softenMarks(ctx, marks);
    } else {
      for (const m of marks) ctx.hide(m.from, m.to);
      // Give the content a pill style (inner padding + rounded corners), only for inline code, not code blocks
      if (marks.length >= 2 && marks[1].from > marks[0].to) {
        ctx.decos.push(Decoration.mark({ class: "cm-lp-ic" }).range(marks[0].to, marks[1].from));
      }
    }
    return;
  }

  if (name === "Strikethrough") {
    const marks = node.node.getChildren("StrikethroughMark");
    if (caretTouches(caret, node.from, node.to)) softenMarks(ctx, marks);
    else for (const m of marks) ctx.hide(m.from, m.to);
    return;
  }

  if (name === "Link") {
    const n = node.node;
    // lezer doesn't know footnotes, so `[^id]` parses as a link without a URL. Hand it to the footnote branch and stop here:
    // decorating both would stack two replaces on the same span, and CodeMirror throws
    if (footnoteRef(ctx, n)) return false;
    if (caretTouches(caret, node.from, node.to)) {
      // The source revealed when editing a link is the biggest shift in the whole doc (a URL can be dozens of chars).
      // The URL is neither truncated nor replaced — it must be editable normally — only the "](url)" segment is shrunk and faded,
      // and the leading "[" is treated as an inline marker, keeping the shift acceptable
      const marks = n.getChildren("LinkMark");
      if (marks.length > 0) softenMarks(ctx, [marks[0]]);
      if (marks.length >= 2 && marks[1].from < node.to) {
        ctx.decos.push(Decoration.mark({ class: "cm-lp-url" }).range(marks[1].from, node.to));
      }
      return;
    }
    const marks = n.getChildren("LinkMark");
    const url = n.getChild("URL");
    const title = n.getChild("LinkTitle");
    for (const m of marks) ctx.hide(m.from, m.to);
    if (url) ctx.hide(url.from, url.to);
    if (title) ctx.hide(title.from, title.to);
    // Link text shows the URL as a tooltip and ⌘/Ctrl+click opens it; a plain click positions the cursor as usual (then reveals source for editing) —
    // matching Obsidian/Typora: link text is body text first, and clicking it usually means wanting to edit there
    const href = url ? safeHref(state.sliceDoc(url.from, url.to)) : null;
    if (href && marks.length >= 2 && marks[1].from > marks[0].to) {
      ctx.decos.push(
        Decoration.mark({
          class: "cm-lp-link",
          attributes: { "data-lp-href": href, title: `${href}\n${t(OPEN_HINT)}` },
        }).range(marks[0].to, marks[1].from)
      );
    }
    return;
  }

  if (name === "URL") {
    // Bare links / autolinks: URLs inside Link and Image are already handled as a whole; this only covers standalone ones
    const parent = node.node.parent?.name;
    if (parent === "Link" || parent === "Image") return;
    if (caretTouches(caret, node.from, node.to)) return; // don't intercept clicks while editing
    const raw = state.sliceDoc(node.from, node.to);
    const href = safeHref(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (!href) return;
    ctx.decos.push(
      Decoration.mark({
        class: "cm-lp-link",
        attributes: { "data-lp-href": href, title: t(OPEN_HINT) },
      }).range(node.from, node.to)
    );
    return;
  }

  if (name === "WikiLink") {
    // `[[target]]` / `[[target|display text]]`: rendered as an in-site link showing only the display text.
    // Children are fully handled here, so return false to stop descending
    const n = node.node;
    const marks = n.getChildren("WikiLinkMark");
    if (caretTouches(caret, node.from, node.to)) {
      softenMarks(ctx, marks); // reveal [[ | ]] while editing, faded like other inline markers
      return false;
    }
    const targetNode = n.getChild("WikiLinkTarget");
    const aliasNode = n.getChild("WikiLinkAlias");
    const target = targetNode ? state.sliceDoc(targetNode.from, targetNode.to).trim() : "";
    if (!target) return false;
    for (const m of marks) ctx.hide(m.from, m.to);
    // With an alias, the target title is hidden too and only the alias remains — matches Obsidian's display
    if (aliasNode && targetNode) ctx.hide(targetNode.from, targetNode.to);
    const textFrom = aliasNode ? aliasNode.from : targetNode?.from;
    const textTo = aliasNode ? aliasNode.to : targetNode?.to;
    if (textFrom !== undefined && textTo !== undefined && textTo > textFrom) {
      ctx.decos.push(
        Decoration.mark({
          class: "cm-lp-wikilink",
          attributes: {
            "data-lp-wiki": target,
            // Same rule as external links: a click edits text, only ⌘/Ctrl+click navigates
            title: `「${target}」\n${t(OPEN_HINT)}`, // i18n-ignore 「」 just quotes the link target; punctuation isn't translated
          },
        }).range(textFrom, textTo)
      );
    }
    return false;
  }

  if (name === "Image") {
    // Image/video reveal includes boundaries (caretTouches): clicking the widget puts the cursor at from+2,
    // and moving to line start or after `)` in this source line then lands on from/to — a strict-interior check would flip back to the image,
    // making the cursor flicker while moving within the line. Cursor only, not selections: on select-all/drag every image would gain a source line
    // and the layout would jolt, while a selected image is already visibly highlighted, so no need to reveal the source.
    const editing = caretTouches(caret, node.from, node.to);
    const n = node.node;
    const url = n.getChild("URL");
    const marks = n.getChildren("LinkMark");
    const src = url ? state.sliceDoc(url.from, url.to) : "";
    const alt = marks.length >= 2 ? state.sliceDoc(marks[0].to, marks[1].from) : "";
    if (src) {
      // Video reuses image syntax, with the title slot carrying the poster= cover convention
      const titleNode = n.getChild("LinkTitle");
      const rawTitle = titleNode
        ? state.sliceDoc(titleNode.from, titleNode.to).replace(/^["'(]|["')]$/g, "")
        : "";
      // Relative paths in a disk library (attachments/…) are swapped for displayable object URLs; leave as-is until read,
      // and once attachments resolve livePreview gets a refresh event and rebuilds the widget (src changed, eq fails)
      const shown = isAttachmentSrc(src) ? (resolveAttachmentSrc(src) ?? src) : src;
      const widget = isVideoUrl(src)
        ? new VideoWidget(shown, alt, posterFromTitle(rawTitle), editing)
        : new ImageWidget(shown, alt, editing);
      if (editing) {
        // In edit state the source isn't hidden; a preview is attached after node.to instead: the whole image vanishing would collapse the layout,
        // and you couldn't see what the edited URL points to. side:1 makes a cursor after `)` draw before the preview (still on the source line).
        // Not registered as atomic — the source must be editable char by char and accept newlines normally right now
        ctx.decos.push(Decoration.widget({ widget, side: 1 }).range(node.to));
      } else {
        ctx.replaceAtomic(node.from, node.to, widget);
      }
    }
    return false; // inner markers already handled as a whole
  }

  if (name === "HorizontalRule") {
    // Same boundary-inclusive check as images: the source appears as soon as the cursor touches either end of `---`.
    // With a strict-interior check, the cursor at the start/end of `---` (Home after opening the widget, or ← up from the next line)
    // would flip straight back to the divider, so moving the cursor on this line would flicker.
    // It also fixes "one backspace wipes the whole line": atomicRanges only registers ranges currently replaced,
    // so with the cursor against `---` it isn't registered at all, and delete goes char by char — one backspace removes one visible `-`
    if (!caretTouches(caret, node.from, node.to)) {
      ctx.replaceAtomic(node.from, node.to, new HrWidget());
    }
    return;
  }
}
