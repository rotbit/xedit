import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** 编辑器的语法高亮配色。从 MarkdownEditor.tsx 抽出来只为控制单文件长度。 */

/** 三级及以下标题的墨色：比正文墨稍退，明暗两套主题都跟着变量走 */
const HEADING_SUB = "color-mix(in srgb, var(--ink) 88%, var(--ink-soft))";

export const mdHighlight = HighlightStyle.define([
  // 标题只在这里定颜色：字号字重两种模式各管各的
  // （即时渲染走 .cm-lp-h* 行级类，源码模式走下面的 sourceHeadingHighlight）
  // H1/H2 是文章骨架，用满墨色；H3 起退半档，让层级除了字号还有明度差
  // （四级以下字号已退回正文，颜色就是唯一的层级信号）
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
    // 底色用半透明：这层背景画在选区（drawSelection 的负层级）之上，
    // 不透光就会把代码上的选中高亮整块挡掉，看着像选不中
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

/** 源码模式专属的标题字号字重：即时渲染下由 .cm-lp-h* 行级类接管，
 *  两套互不干扰——改排版节奏时不必担心弄乱源码视图 */
export const sourceHeadingHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.5em", fontWeight: "700" },
  { tag: tags.heading2, fontSize: "1.25em", fontWeight: "700" },
  { tag: tags.heading3, fontSize: "1.1em", fontWeight: "700" },
  { tag: tags.heading4, fontWeight: "700" },
]);

/** 代码块内嵌语言的 token 配色：随主题变量明暗切换。
 *  这些 tag 只由围栏里的嵌套语法树产出，Markdown 自身的标记不受影响 */
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
