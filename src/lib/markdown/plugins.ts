import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { isAttachmentSrc, resolveAttachmentSrc } from "@/lib/localBackend/attachmentUrls";
import { isVideoUrl, posterFromTitle } from "@/lib/media";
import { wikiLinkText } from "@/lib/wikiLink";
import { parseCalloutHead } from "@/lib/callout";

// —— Structured headings ——
// Outputs <h2><span class="prefix"></span><span class="content">Title</span><span class="suffix"></span></h2>
// WeChat drops pseudo-elements, so themes decorate with real prefix/suffix nodes to survive in WeChat Official Accounts.
export function headingPlugin(md: MarkdownIt): void {
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token.map) token.attrSet("data-line", String(token.map[0]));
    return `${self.renderToken(tokens, idx, options)}<span class="prefix"></span><span class="content">`;
  };
  md.renderer.rules.heading_close = (tokens, idx) =>
    `</span><span class="suffix"></span></${tokens[idx].tag}>\n`;
}

// —— Standalone images/videos become figures, with alt text as the caption ——
// Videos reuse image syntax ![caption](xx.mp4 "poster=coverURL"), detected by extension and output as <video>.
export function figurePlugin(md: MarkdownIt): void {
  md.core.ruler.push("implicit_figure", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i + 2 < tokens.length + 2 && i < tokens.length; i++) {
      const open = tokens[i];
      const inline = tokens[i + 1];
      const close = tokens[i + 2];
      if (
        open?.type === "paragraph_open" &&
        close?.type === "paragraph_close" &&
        inline?.type === "inline" &&
        inline.children?.length === 1 &&
        inline.children[0].type === "image"
      ) {
        open.type = "figure_open";
        open.tag = "figure";
        close.type = "figure_close";
        close.tag = "figure";
      }
    }
  });

  md.renderer.rules.image = (tokens, idx) => {
    const token = tokens[idx];
    const rawSrc = token.attrGet("src") ?? "";
    // Relative paths in a disk library (attachments/...) become readable object URLs;
    // until read, keep the original; once the attachment resolves a re-render is triggered (see attachmentUrls)
    const shownSrc = isAttachmentSrc(rawSrc) ? (resolveAttachmentSrc(rawSrc) ?? rawSrc) : rawSrc;
    const src = md.utils.escapeHtml(shownSrc);
    const alt = md.utils.escapeHtml(token.content ?? "");
    const title = token.attrGet("title");
    // Whether we're inside a figure is decided by the parent token; inside a figure emit the caption
    const inFigure = tokens.length === 1;

    if (isVideoUrl(rawSrc)) {
      const poster = posterFromTitle(title);
      const posterAttr = poster ? ` poster="${md.utils.escapeHtml(poster)}"` : "";
      const video = `<video src="${src}"${posterAttr} controls preload="metadata" playsinline></video>`;
      const caption = token.content ?? "";
      if (inFigure && caption) {
        return `${video}<figcaption>${md.utils.escapeHtml(caption)}</figcaption>`;
      }
      return video;
    }

    const caption = token.content || title || "";
    const titleAttr = title ? ` title="${md.utils.escapeHtml(title)}"` : "";
    const img = `<img src="${src}" alt="${alt}"${titleAttr}>`;
    if (inFigure && caption) {
      return `${img}<figcaption>${md.utils.escapeHtml(caption)}</figcaption>`;
    }
    return img;
  };
}

// —— [toc] table of contents ——
// A standalone [toc] line (case-insensitive) becomes a static TOC list (no jumping inside WeChat, it just shows the hierarchy).
export function tocPlugin(md: MarkdownIt): void {
  md.core.ruler.push("toc", (state) => {
    const tokens = state.tokens;
    const tocIndex = tokens.findIndex(
      (t, i) =>
        t.type === "paragraph_open" &&
        tokens[i + 1]?.type === "inline" &&
        /^\[toc\]$/i.test(tokens[i + 1].content.trim())
    );
    if (tocIndex === -1) return;

    const headings: { level: number; text: string }[] = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === "heading_open") {
        const level = Number(tokens[i].tag.slice(1));
        const text = tokens[i + 1]?.content ?? "";
        if (level >= 1 && level <= 3) headings.push({ level, text });
      }
    }

    let html = `<section class="table-of-contents"><p class="toc-title">目录</p><ul>`; // i18n-ignore TOC title goes into the rendered output as content
    for (const h of headings) {
      html += `<li class="toc-level-${h.level}">${md.utils.escapeHtml(h.text)}</li>`;
    }
    html += `</ul></section>`;

    const htmlToken = new state.Token("html_block", "", 0);
    htmlToken.content = html;
    htmlToken.map = tokens[tocIndex].map;
    tokens.splice(tocIndex, 3, htmlToken);
  });
}

// —— Preserve extra blank lines ——
// Markdown collapses any run of blank lines into one paragraph break, but WeChat authors use blank lines for spacing,
// so blank lines in the editor should match the render: 1 blank line is a normal paragraph break,
// and from the 2nd on each blank line emits an empty paragraph (<p><br></p>, how the WeChat editor itself represents blank lines).
// Leading blank lines separate nothing, so each counts as spacing; but if the document starts with frontmatter (already stripped by renderMarkdown),
// that's the "previous block", and the blank line right after it only separates it from the body and must not become an empty paragraph in WeChat.
export function blankLinePlugin(md: MarkdownIt): void {
  md.core.ruler.push("preserve_blank_lines", (state) => {
    const tokens = state.tokens;
    // These empty paragraphs' data-line is spliced into the HTML on the spot, before lineMapPlugin shifts token.map,
    // so the frontmatter line offset must be added here (see renderMarkdown's lineOffset)
    const offset = lineOffsetOf(state.env);
    let depth = 0;
    let prevEnd = 0; // End line of the previous top-level block (excluding trailing blank lines)
    let atStart = offset === 0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (depth === 0 && token.nesting >= 0 && token.map) {
        const gap = token.map[0] - prevEnd;
        const extra = atStart ? gap : gap - 1;
        if (extra > 0) {
          const firstLine = atStart ? prevEnd : prevEnd + 1;
          let html = "";
          for (let n = 0; n < extra; n++) {
            html += `<p data-line="${firstLine + n + offset}"><br></p>\n`;
          }
          const filler = new state.Token("html_block", "", 0);
          filler.map = [prevEnd, token.map[0]];
          filler.content = html;
          tokens.splice(i, 0, filler);
          i++;
        }
        prevEnd = token.map[1];
        atStart = false;
      }
      depth += token.nesting;
    }
  });
}

/** Line-number offset to add for this render: how many lines of frontmatter renderMarkdown stripped */
function lineOffsetOf(env: unknown): number {
  const value = (env as { lineOffset?: unknown } | null)?.lineOffset;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// —— Write data-line on block elements for editor/preview scroll sync ——
// This rule runs last among the core rules, so it also applies the frontmatter line offset to token.map:
// data-line for headings, code blocks, tables and math is read from token.map at render time,
// so shifting once here saves each of them adding it again, and keeps them consistent.
export function lineMapPlugin(md: MarkdownIt): void {
  md.core.ruler.push("line_map", (state) => {
    const offset = lineOffsetOf(state.env);
    const walk = (tokens: Token[]) => {
      for (const token of tokens) {
        if (offset !== 0 && token.map) token.map = [token.map[0] + offset, token.map[1] + offset];
        if (token.map && token.nesting === 1 && !token.attrGet("data-line")) {
          token.attrSet("data-line", String(token.map[0]));
        }
      }
    };
    walk(state.tokens);
  });
}

// —— [[Wikilinks]] ——
// Outputs <span class="wikilink" data-wiki="target">display text</span>, deliberately not <a>:
// in-site links mean nothing outside xedit; in the WeChat/Zhihu copy pipelines a span lands as plain text
// instead of a dead link. Clicks are handled by event delegation in the preview component (see Preview.tsx).
export function wikiLinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("link", "wikilink", (state, silent) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x5b || state.src.charCodeAt(start + 1) !== 0x5b) {
      return false;
    }
    const close = state.src.indexOf("]]", start + 2);
    if (close === -1 || close + 2 > state.posMax) return false;
    const body = state.src.slice(start + 2, close);
    // No line breaks, no nested [[: same rules as the editor-side lezer extension
    if (/[\r\n]/.test(body) || body.includes("[[")) return false;

    const bar = body.indexOf("|");
    const target = (bar === -1 ? body : body.slice(0, bar)).trim();
    if (!target) return false; // Empty targets aren't links

    if (!silent) {
      const token = state.push("wikilink", "", 0);
      token.info = target; // Target title (info rather than meta: the latter is typed any)
      token.content = wikiLinkText(target, bar === -1 ? undefined : body.slice(bar + 1));
    }
    state.pos = close + 2;
    return true;
  });

  md.renderer.rules.wikilink = (tokens, idx) => {
    const token = tokens[idx];
    const target = md.utils.escapeHtml(token.info);
    return `<span class="wikilink" data-wiki="${target}">${md.utils.escapeHtml(token.content)}</span>`;
  };
}

// —— Obsidian-style callouts ——
// A blockquote starting with `> [!tip] Title` is replaced wholesale with <section class="callout callout-tip">,
// with a <section class="callout-title"> inserted at the front.
// section rather than div: sanitize.ts already allows section, and WeChat pastes keep it too.
// The rule hooks into core before inline: blockquote is parsed but inline tokens are still raw text,
// so editing content suffices without taking apart built children, and **bold** in the title still works.
export function calloutPlugin(md: MarkdownIt): void {
  md.core.ruler.before("inline", "callout", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "blockquote_open") continue;
      if (tokens[i + 1]?.type !== "paragraph_open" || tokens[i + 2]?.type !== "inline") continue;

      const inline = tokens[i + 2];
      // With breaks:true the first paragraph may be one block of "first line \n body...", so only check the first line for the marker
      const br = inline.content.indexOf("\n");
      const head = parseCalloutHead(br === -1 ? inline.content : inline.content.slice(0, br));
      if (!head) continue;

      const open = tokens[i];
      open.tag = "section";
      open.attrSet("class", `callout callout-${head.type}`);
      open.attrSet("data-callout", head.type);
      // The matching blockquote_close may be several nested blocks away; count nesting to find it and swap its tag too
      for (let depth = 0, j = i; j < tokens.length; j++) {
        depth += tokens[j].nesting;
        if (depth === 0) {
          tokens[j].tag = "section";
          break;
        }
      }

      const headLine = open.map ? open.map[0] : 0;
      const body = br === -1 ? "" : inline.content.slice(br + 1);
      if (body.trim()) {
        inline.content = body;
        // The body actually starts on the next line; shift data-line by one so scroll sync isn't off by a line for the whole block
        for (const t of [tokens[i + 1], inline]) {
          if (t.map) t.map = [t.map[0] + 1, t.map[1]];
        }
      } else {
        tokens.splice(i + 1, 3); // The first paragraph is just the marker line; keeping it leaves an empty <p>
      }

      // The title uses a real token rather than html_block: it runs before the inline rule,
      // so this inline token is parsed normally afterwards and **bold** or `code` in the title renders
      const titleOpen = new state.Token("callout_title_open", "section", 1);
      titleOpen.block = true;
      titleOpen.attrSet("class", "callout-title");
      titleOpen.map = [headLine, headLine + 1];
      const titleInline = new state.Token("inline", "", 0);
      titleInline.block = true;
      titleInline.content = head.title;
      titleInline.children = [];
      titleInline.map = titleOpen.map;
      const titleClose = new state.Token("callout_title_close", "section", -1);
      titleClose.block = true;
      tokens.splice(i + 1, 0, titleOpen, titleInline, titleClose);
      i += 3;
    }
  });
}
