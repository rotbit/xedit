import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** Editor syntax highlighting colors. Pulled out of MarkdownEditor.tsx only to keep file length in check. */

/** Ink color for H3 and below: slightly lighter than body ink; both light and dark themes follow the variable */
const HEADING_SUB = "color-mix(in srgb, var(--ink) 88%, var(--ink-soft))";

export const mdHighlight = HighlightStyle.define([
  // Headings only get color here: font size and weight are handled separately per mode
  // (live preview uses .cm-lp-h* line classes, source mode uses sourceHeadingHighlight below)
  // H1/H2 are the document's skeleton and use full ink; from H3 it steps back half a notch, so levels differ in lightness as well as size
  // (below H4 the size is back to body text, so color is the only level signal)
  { tag: tags.heading1, color: "var(--ink)" },
  { tag: tags.heading2, color: "var(--ink)" },
  { tag: tags.heading3, color: HEADING_SUB },
  { tag: tags.heading4, color: HEADING_SUB },
  { tag: tags.heading5, color: HEADING_SUB },
  { tag: tags.heading6, color: HEADING_SUB },
  { tag: tags.strong, fontWeight: "700", color: "var(--accent-deep)" },
  { tag: tags.emphasis, fontStyle: "italic", color: "var(--accent-deep)" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--ink-faint)" },
  { tag: tags.link, color: "var(--md-link)" },
  { tag: tags.url, color: "var(--md-link)" },
  {
    // Semi-transparent background: this layer is painted above the selection (drawSelection's negative z-layer),
    // so an opaque one would hide the selection highlight on code entirely, making it look unselectable
    tag: tags.monospace,
    color: "var(--md-code)",
    background: "var(--md-code-tint)",
    fontFamily: "var(--mono)",
    borderRadius: "3px",
  },
  { tag: tags.quote, color: "var(--ink-soft)" },
  { tag: tags.meta, color: "var(--ink-faint)" },
  { tag: tags.processingInstruction, color: "var(--accent)" },
  { tag: tags.contentSeparator, color: "var(--accent)", fontWeight: "700" },
]);

/** Source-mode-only heading sizes and weights: in live preview .cm-lp-h* line classes take over,
 *  and the two don't interfere, so changing typographic rhythm won't mess up the source view */
export const sourceHeadingHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.5em", fontWeight: "700" },
  { tag: tags.heading2, fontSize: "1.25em", fontWeight: "700" },
  { tag: tags.heading3, fontSize: "1.1em", fontWeight: "700" },
  { tag: tags.heading4, fontWeight: "700" },
]);

/** Token colors for embedded languages in code blocks: switch with theme variables for light/dark.
 *  These tags only come from the nested syntax tree inside fences; Markdown's own markup is unaffected */
export const codeHighlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.self],
    color: "var(--code-keyword)",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.character],
    color: "var(--code-string)",
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    color: "var(--code-comment)",
    fontStyle: "italic",
  },
  {
    tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null, tags.atom],
    color: "var(--code-number)",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName],
    color: "var(--code-func)",
  },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--code-func)" },
  {
    tag: [tags.typeName, tags.className, tags.namespace, tags.definition(tags.typeName)],
    color: "var(--code-type)",
  },
  { tag: [tags.regexp, tags.escape], color: "var(--code-number)" },
]);
