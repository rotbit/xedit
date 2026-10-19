import { parseMarkdown, type RenderEnv } from "./renderer";
import { sanitizeFragment, sanitizeHtml } from "./sanitize";

export interface PreviewBlock {
  /** Fully sanitized block; line numbers are relative to lineOffset so inserting a line doesn't invalidate later blocks' cache. */
  html: string;
  /** Raw HTML is null: user-written data-line inside it must be kept as-is. */
  lineOffset: number | null;
}

/**
 * Parse the whole document first to keep cross-block semantics of TOC, footnotes and reference links, then group by top-level token.
 * Lists, tables, quotes etc. always render as whole blocks; no containers are added, so themes' parent/child selectors stay intact.
 */
function renderBlocks(source: string, env: RenderEnv): PreviewBlock[] {
  const parsed = parseMarkdown(source, env);
  const { md, tokens } = parsed;
  const render = (from: number, to: number) => md.renderer.render(tokens.slice(from, to), md.options, parsed.env);
  if (parsed.env.hasRawHtml) return [{ html: render(0, tokens.length), lineOffset: null }];

  const blocks: PreviewBlock[] = [];
  let from = 0;
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    depth += tokens[i].nesting;
    if (depth !== 0) continue;
    const html = render(from, i + 1);
    const lineOffset = Number(/ data-line="(\d+)"/.exec(html)?.[1] ?? 0);
    blocks.push({
      html: html.replace(/ data-line="(\d+)"/g, (_, line: string) => ` data-line="${Number(line) - lineOffset}"`),
      lineOffset,
    });
    from = i + 1;
  }
  return blocks;
}

/** Each preview keeps only the current version's sanitized output, released on unmount, accumulating no edit history. */
export function createPreviewRenderer() {
  let cache = new Map<string, string>();
  return (source: string, env: RenderEnv = {}): PreviewBlock[] => {
    const raw = renderBlocks(source, env);
    const next = new Map<string, string>();
    if (raw[0]?.lineOffset === null) {
      const html = raw[0].html;
      next.set(html, cache.get(html) ?? sanitizeHtml(html));
    } else {
      const missing = [...new Set(raw.map((block) => block.html).filter((html) => !cache.has(html)))];
      // On first open sanitize the whole batch at once, rather than creating a DOMPurify document per small paragraph.
      // The section is only used for offscreen splitting and never enters the preview; raw HTML doesn't take this chunked path.
      if (missing.length > 0) {
        const fragment = sanitizeFragment(missing.map((html) => `<section>${html}</section>`).join(""));
        Array.from(fragment.children).forEach((el, i) => next.set(missing[i], el.innerHTML));
      }
      for (const { html } of raw) if (cache.has(html)) next.set(html, cache.get(html)!);
    }
    const blocks = raw.map(({ html, lineOffset }) => ({ html: next.get(html)!, lineOffset }));
    cache = next;
    return blocks;
  };
}

interface MountedBlock extends PreviewBlock {
  nodes: ChildNode[];
  anchors: { el: Element; line: number }[];
}

/** Build DOM and a relative line index from sanitized HTML; later line shifts only touch attributes, not rebuilding images/videos. */
function mountBlock(block: PreviewBlock, fragment: ParentNode): MountedBlock {
  const anchors = block.lineOffset === null ? [] : Array.from(fragment.querySelectorAll("[data-line]"), (el) => ({
    el,
    line: Number(el.getAttribute("data-line")),
  }));
  return { ...block, lineOffset: null, nodes: Array.from(fragment.childNodes), anchors };
}

/** New blocks are also parsed offscreen in one go, so a long document's first paint doesn't invoke the HTML parser for thousands of small blocks. */
function mountBlocks(root: HTMLElement, blocks: PreviewBlock[]): MountedBlock[] {
  if (blocks.length === 0) return [];
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  if (blocks[0].lineOffset === null) {
    return [mountBlock(blocks[0], range.createContextualFragment(blocks[0].html))];
  }
  const fragment = range.createContextualFragment(blocks.map((block) => `<section>${block.html}</section>`).join(""));
  return Array.from(fragment.children, (el, i) => mountBlock(blocks[i], el));
}

/**
 * Reuse DOM for identical blocks and insert/remove only what changed. Identical content pairs up in order, so duplicate paragraphs don't swap.
 * No wrapper elements or marker comments are inserted; the final DOM matches the original whole-document innerHTML.
 */
export function createPreviewUpdater(root: HTMLElement) {
  let mounted: MountedBlock[] = [];
  return (blocks: PreviewBlock[]) => {
    const available = new Map<string, MountedBlock[]>();
    for (let i = mounted.length - 1; i >= 0; i--) {
      const block = mounted[i];
      const list = available.get(block.html);
      if (list) list.push(block);
      else available.set(block.html, [block]);
    }
    const reused = blocks.map((block) => {
      const previous = available.get(block.html)?.pop();
      const compatible = previous && (previous.lineOffset === null) === (block.lineOffset === null);
      return compatible ? previous : null;
    });
    const fresh = mountBlocks(root, blocks.filter((_, i) => !reused[i]));
    let freshIndex = 0;
    const next = blocks.map((block, i) => {
      const entry = reused[i] ?? fresh[freshIndex++];
      if (entry.lineOffset !== block.lineOffset) {
        for (const { el, line } of entry.anchors) el.setAttribute("data-line", String(line + block.lineOffset!));
        entry.lineOffset = block.lineOffset;
      }
      return entry;
    });
    // Remove changed old blocks first; otherwise one changed paragraph would drag every unchanged node after it in front, one by one.
    const retained = new Set(next);
    for (const block of mounted) {
      if (!retained.has(block)) for (const node of block.nodes) root.removeChild(node);
    }
    let cursor = root.firstChild;
    for (const entry of next) {
      for (const node of entry.nodes) {
        if (node !== cursor) root.insertBefore(node, cursor);
        cursor = node.nextSibling;
      }
    }
    mounted = next;
    while (cursor) {
      const next = cursor.nextSibling;
      root.removeChild(cursor);
      cursor = next;
    }
  };
}
