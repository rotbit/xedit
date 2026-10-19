/**
 * Markdown → HTML render entry for WeChat article bodies. Preview, copy to WeChat and export all go through renderMarkdown,
 * so all three see exactly the same structure, and visual differences come only from theme CSS.
 * The plugin registration order below has dependencies (reasons noted inline); reordering changes the output structure.
 */
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
// Full highlight.js ships 190+ languages and bundles to MBs; the common set's 35 mainstream languages suffice for WeChat,
// and rarer languages fall back to escaped output without highlighting (the fence renderer guards with getLanguage)
import hljs from "highlight.js/lib/common";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import http from "highlight.js/lib/languages/http";
import nginx from "highlight.js/lib/languages/nginx";

hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("http", http);
hljs.registerLanguage("nginx", nginx);
import { parseFrontmatter } from "@/lib/frontmatter";
import { mathPlugin } from "./math";
import { intrawordStarPlugin } from "./intrawordStar";
import {
  headingPlugin,
  figurePlugin,
  tocPlugin,
  blankLinePlugin,
  lineMapPlugin,
  wikiLinkPlugin,
  calloutPlugin,
} from "./plugins";

/** Per-render switches, passed through by renderMarkdown to renderer rules, never global state. */
export interface RenderEnv {
  /** Use Mac-window style for code blocks */
  macCode?: boolean;
  /** Internal: number of lines stripped as frontmatter, added back to data-line (filled by renderMarkdown, callers needn't pass it) */
  lineOffset?: number;
}

/** Reuse highlighting by source text; cap both entry count and an estimated UTF-16 byte size so old versions of long code can't fill memory. */
const highlightCache = new Map<string, string>();
const HIGHLIGHT_CACHE_MAX = 300;
const HIGHLIGHT_CACHE_BYTES = 4 * 1024 * 1024;
let highlightBytes = 0;
function highlightFence(lang: string, source: string): string {
  // Separate language and source with NUL: source can't contain NUL, whereas a space or newline could collide with the content itself.
  const key = `${lang}\0${source}`;
  const hit = highlightCache.get(key);
  if (hit !== undefined) {
    // Move recently used to the end so code blocks in continuous use aren't evicted by new entries first.
    highlightCache.delete(key);
    highlightCache.set(key, hit);
    return hit;
  }
  const value = hljs.highlight(source, { language: lang, ignoreIllegals: true }).value;
  const bytes = (key.length + value.length) * 2;
  if (bytes > HIGHLIGHT_CACHE_BYTES) return value;
  while (highlightCache.size >= HIGHLIGHT_CACHE_MAX || highlightBytes + bytes > HIGHLIGHT_CACHE_BYTES) {
    const [oldKey, oldValue] = highlightCache.entries().next().value!;
    highlightBytes -= (oldKey.length + oldValue.length) * 2;
    highlightCache.delete(oldKey);
  }
  highlightCache.set(key, value);
  highlightBytes += bytes;
  return value;
}

/** Assemble the MarkdownIt instance; runs once on first render and is reused afterwards (see mdInstance). */
function createMd(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    // Line breaks in the editor are WYSIWYG: a single Enter is <br>, matching how WeChat authors write
    breaks: true,
  });
  // Match the editor parser: no Setext underline headings (see editorExtensions.ts)
  md.disable("lheading");

  // In sync with the editor parser: a single * in `3*2` is multiplication, not italics (see intrawordStar.ts)
  md.use(intrawordStarPlugin);
  md.use(footnote);
  md.use(taskLists, { label: false });
  md.use(mathPlugin);
  md.use(wikiLinkPlugin);
  // Before headingPlugin: callouts must finish reshaping the blockquote before heading/caption rules run
  md.use(calloutPlugin);
  md.use(headingPlugin);
  md.use(figurePlugin);
  md.use(tocPlugin);
  // After toc/figure: they match adjacent token patterns, and inserting empty paragraphs first would break the structure
  md.use(blankLinePlugin);
  md.use(lineMapPlugin);

  // Raw HTML may open and close tags across Markdown blocks, so it must be sanitized and DOM-parsed as a whole.
  // Inserted after inline, before other plugins reshape: complete HTML generated for TOC, blank lines and task boxes isn't raw HTML.
  md.core.ruler.after("inline", "raw_html_context", (state) => {
    state.env.hasRawHtml = state.tokens.some(
      (token) => token.type === "html_block" || token.children?.some((child) => child.type === "html_inline")
    );
  });

  md.renderer.rules.fence = (tokens, idx, _options, env: RenderEnv) => {
    const token = tokens[idx];
    const info = token.info.trim();
    const lang = info.split(/\s+/)[0] || "";
    let code: string;
    if (lang && hljs.getLanguage(lang)) {
      code = highlightFence(lang, token.content);
    } else {
      code = md.utils.escapeHtml(token.content);
    }
    // Strip the trailing extra newline
    code = code.replace(/\n$/, "");
    const line = token.map ? ` data-line="${token.map[0]}"` : "";
    const macClass = env?.macCode ? " mac-code" : "";
    return `<pre class="code-block${macClass}"${line}><code class="hljs${lang ? ` language-${lang}` : ""}">${code}</code></pre>\n`;
  };

  // Wrap tables in a horizontally scrollable container (needed for wide tables in WeChat)
  md.renderer.rules.table_open = (tokens, idx) => {
    const line = tokens[idx].map ? ` data-line="${tokens[idx].map![0]}"` : "";
    return `<section class="table-container"${line}><table>`;
  };
  md.renderer.rules.table_close = () => `</table></section>\n`;

  return md;
}

// Lazy singleton: the instance can render repeatedly (state lives in env), but registering a dozen plugins isn't cheap, so build once
let mdInstance: MarkdownIt | null = null;

/** Render the body to HTML. src may include frontmatter, stripped here (with the line offset compensated). */
export function parseMarkdown(src: string, env: RenderEnv = {}) {
  if (!mdInstance) mdInstance = createMd();
  // Frontmatter is machine metadata and shouldn't appear in a WeChat article: preview, copy and export share this one entry,
  // so stripping once cleans all three. After stripping, markdown-it counts lines from 0 again, so the frontmatter's line count
  // is passed in as lineOffset, keeping data-line the real editor line number (see lineMapPlugin),
  // and scroll sync is no longer off by those lines
  const fm = parseFrontmatter(src);
  // The stripped section's newline count is its line count (if the closing `---` is at EOF there's no newline, and the body is empty anyway)
  const renderEnv: RenderEnv & { hasRawHtml?: boolean } = fm
    ? { ...env, lineOffset: src.slice(0, fm.end).split("\n").length - 1 }
    : { ...env };
  const tokens = mdInstance.parse(fm?.body ?? src, renderEnv);
  return { md: mdInstance, tokens, env: renderEnv };
}

/** Copy and export still return the full HTML, sharing the same parser and render rules as preview. */
export function renderMarkdown(src: string, env: RenderEnv = {}): string {
  const parsed = parseMarkdown(src, env);
  return parsed.md.renderer.render(parsed.tokens, parsed.md.options, parsed.env);
}
