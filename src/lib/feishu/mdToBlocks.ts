import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { feishuFontColorOf } from "./colors";
import { CODE_LANG } from "./markdown";
import { intrawordStarPlugin } from "@/lib/markdown/intrawordStar";

/**
 * Markdown → Feishu docx block tree (the reverse of markdown.ts).
 * Output matches the "create nested blocks" API shape: list of top-level block ids + full block array (temporary ids referencing each other);
 * images start as placeholders (after creation the push flow uploads the asset and fills in the token).
 * Covers the types symmetric with the pull direction: headings/paragraphs/lists/todos/quotes/code blocks/dividers/images/tables.
 */

export interface OutBlock {
  block_id: string;
  block_type: number;
  children?: string[];
  [payload: string]: unknown;
}

export interface MdBuild {
  /** Top-level page block ids (ordered) */
  children: string[];
  /** All blocks (including nested), referenced by temporary id */
  blocks: Map<string, OutBlock>;
  /** Image placeholder block id → original URL and alt text (in document order) */
  images: { blockId: string; url: string; alt: string }[];
}

// Write-direction subset matching the B constants in markdown.ts
const T = {
  text: 2,
  h1: 3,
  bullet: 12,
  ordered: 13,
  code: 14,
  todo: 17,
  divider: 22,
  image: 27,
  table: 31,
  tableCell: 32,
  quoteContainer: 34,
} as const;

/** Language tag → Feishu code block enum; plus a few common aliases */
const LANG_CODE: Record<string, number> = Object.fromEntries([
  ...Object.entries(CODE_LANG).map(([n, name]) => [name, Number(n)] as const),
  ["js", 30],
  ["jsx", 30],
  ["ts", 63],
  ["tsx", 63],
  ["sh", 60],
  ["zsh", 60],
  ["yml", 67],
  ["golang", 22],
  ["py", 49],
  ["plaintext", 1],
  ["text", 1],
]);

interface ElementStyle {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  inline_code?: boolean;
  /** Feishu font color enum (FontColor 1–7) */
  text_color?: number;
  link?: { url: string };
}

type TextElement =
  | { text_run: { content: string; text_element_style?: ElementStyle } }
  | { equation: { content: string } };

/** Conditions for treating $tex$ as math: contains TeX-ish characters, so amounts like 「$5 和 $10」 aren't misdetected */
const EQUATION_RE = /\$([^$\n]{1,200}?)\$/g;
const looksLikeTex = (s: string): boolean => /[\\^_{}]/.test(s);

/** Split inline math out of text; plain text goes into text_run as-is */
function emitText(out: TextElement[], content: string, style: ElementStyle): void {
  if (!content) return;
  let last = 0;
  for (const m of content.matchAll(EQUATION_RE)) {
    if (!looksLikeTex(m[1])) continue;
    const before = content.slice(last, m.index);
    if (before) out.push(run(before, style));
    out.push({ equation: { content: m[1] } });
    last = m.index + m[0].length;
  }
  const rest = content.slice(last);
  if (rest) out.push(run(rest, style));
}

function run(content: string, style: ElementStyle): TextElement {
  const s: ElementStyle = {};
  if (style.bold) s.bold = true;
  if (style.italic) s.italic = true;
  if (style.strikethrough) s.strikethrough = true;
  if (style.inline_code) s.inline_code = true;
  if (style.text_color) s.text_color = style.text_color;
  if (style.link) s.link = style.link;
  return {
    text_run: {
      content,
      ...(Object.keys(s).length > 0 ? { text_element_style: s } : {}),
    },
  };
}

/** Inline token children → Feishu rich text elements; inline images degrade to links */
function inlineElements(children: Token[] | null): TextElement[] {
  const out: TextElement[] = [];
  const style: ElementStyle = {};
  // Editor font color <span style="color:…">…</span>: opening tags push and take effect, closing tags pop and restore.
  // Every span is pushed (including ones without color) so closing tags always pair up correctly
  const colorStack: (number | undefined)[] = [];
  let linkUrl = "";
  for (const tk of children ?? []) {
    switch (tk.type) {
      case "text":
        emitText(out, tk.content, style);
        break;
      case "code_inline":
        out.push(run(tk.content, { ...style, inline_code: true }));
        break;
      case "strong_open":
        style.bold = true;
        break;
      case "strong_close":
        style.bold = false;
        break;
      case "em_open":
        style.italic = true;
        break;
      case "em_close":
        style.italic = false;
        break;
      case "s_open":
        style.strikethrough = true;
        break;
      case "s_close":
        style.strikethrough = false;
        break;
      case "link_open":
        linkUrl = tk.attrGet("href") ?? "";
        if (linkUrl) style.link = { url: encodeURIComponent(linkUrl) };
        break;
      case "link_close":
        delete style.link;
        linkUrl = "";
        break;
      case "image": {
        // Images mixed inline have no block position, so degrade to a link (images alone in a paragraph are handled at block level)
        const src = tk.attrGet("src") ?? "";
        const alt = tk.content || "图片"; // i18n-ignore imported document content (Markdown/Feishu block conversion), not UI copy
        if (src) {
          out.push(run(alt, { ...style, link: { url: encodeURIComponent(src) } }));
        }
        break;
      }
      case "softbreak":
      case "hardbreak":
        out.push(run("\n", style));
        break;
      case "html_inline": {
        const t = tk.content.trim();
        if (/^<br\s*\/?>$/i.test(t)) {
          out.push(run("\n", style));
        } else if (/^<span\b[^>]*>$/i.test(t)) {
          colorStack.push(style.text_color);
          const css = t.match(/color:\s*([^;"']+)/i)?.[1];
          const mapped = css ? feishuFontColorOf(css) : undefined;
          if (mapped !== undefined) style.text_color = mapped;
        } else if (/^<\/span\s*>$/i.test(t)) {
          if (colorStack.length > 0) {
            const prev = colorStack.pop();
            if (prev === undefined) delete style.text_color;
            else style.text_color = prev;
          }
        } else {
          emitText(out, tk.content, style);
        }
        break;
      }
      default:
        if (tk.content) emitText(out, tk.content, style);
    }
  }
  return out;
}

/** markdown-it flat token stream → node tree rebuilt by pairing _open/_close */
interface Node {
  token: Token;
  children: Node[];
}

function buildTree(tokens: Token[]): Node[] {
  const root: Node = { token: null as unknown as Token, children: [] };
  const stack: Node[] = [root];
  for (const tk of tokens) {
    if (tk.nesting === 1) {
      const node: Node = { token: tk, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (tk.nesting === -1) {
      if (stack.length > 1) stack.pop();
    } else {
      stack[stack.length - 1].children.push({ token: tk, children: [] });
    }
  }
  return root.children;
}

class Builder {
  private seq = 0;
  private blocks = new Map<string, OutBlock>();
  private images: MdBuild["images"] = [];

  // Not using Omit<OutBlock,...>: the index signature makes Omit drop block_type's required constraint
  private add(block: { block_type: number; children?: string[]; [payload: string]: unknown }): string {
    const id = `b${++this.seq}`;
    this.blocks.set(id, { ...block, block_id: id });
    return id;
  }

  private textBlock(type: number, key: string, elements: TextElement[], style?: object): string {
    return this.add({
      block_type: type,
      [key]: { elements, ...(style ? { style } : {}) },
    });
  }

  build(nodes: Node[]): MdBuild {
    const children = this.renderSiblings(nodes);
    return { children, blocks: this.blocks, images: this.images };
  }

  /** Render a sibling node sequence, returning the generated block ids */
  private renderSiblings(nodes: Node[]): string[] {
    const ids: string[] = [];
    for (const node of nodes) ids.push(...this.renderNode(node));
    return ids;
  }

  private renderNode(node: Node): string[] {
    const tk = node.token;
    switch (tk.type) {
      case "heading_open": {
        const level = Math.min(Number(tk.tag.slice(1)) || 1, 6);
        const inline = node.children[0]?.token;
        return [
          this.textBlock(
            T.h1 + level - 1,
            `heading${level}`,
            inlineElements(inline?.children ?? null)
          ),
        ];
      }
      case "paragraph_open":
        return this.renderParagraph(node);
      case "fence":
      case "code_block": {
        const lang = tk.type === "fence" ? (tk.info.trim().split(/\s+/)[0] ?? "") : "";
        const language = LANG_CODE[lang.toLowerCase()] ?? 1;
        const body = tk.content.replace(/\n$/, "");
        return [
          this.textBlock(T.code, "code", [run(body, {})], { language, wrap: false }),
        ];
      }
      case "blockquote_open": {
        const inner = this.renderSiblings(node.children);
        if (inner.length === 0) return [];
        return [this.add({ block_type: T.quoteContainer, quote_container: {}, children: inner })];
      }
      case "bullet_list_open":
        return this.renderList(node, false);
      case "ordered_list_open":
        return this.renderList(node, true);
      case "hr":
        return [this.add({ block_type: T.divider, divider: {} })];
      case "table_open":
        return this.renderTable(node);
      case "html_block": {
        const text = tk.content.trim();
        return text ? [this.textBlock(T.text, "text", [run(text, {})])] : [];
      }
      case "inline":
        // Fault tolerance: a bare inline (normally wrapped in paragraph/heading)
        return [this.textBlock(T.text, "text", inlineElements(tk.children))];
      default:
        // Unhandled container types: flatten and render children, never drop content
        if (node.children.length > 0) return this.renderSiblings(node.children);
        return [];
    }
  }

  /** Paragraph: standalone images become image blocks, the rest goes through rich text */
  private renderParagraph(node: Node): string[] {
    const inline = node.children[0]?.token;
    const kids = inline?.children ?? [];
    const meaningful = kids.filter((t) => !(t.type === "text" && !t.content.trim()));
    const allImages =
      meaningful.length > 0 &&
      meaningful.every((t) => t.type === "image" || t.type === "softbreak");
    if (allImages) {
      const ids: string[] = [];
      for (const t of meaningful) {
        if (t.type !== "image") continue;
        const src = t.attrGet("src") ?? "";
        if (!src) continue;
        const id = this.add({ block_type: T.image, image: {} });
        this.images.push({ blockId: id, url: src, alt: t.content || "" });
        ids.push(id);
      }
      if (ids.length > 0) return ids;
    }
    const elements = inlineElements(kids);
    if (elements.length === 0) return [];
    return [this.textBlock(T.text, "text", elements)];
  }

  /** List: todo syntax ([ ]/[x] prefix) becomes todo blocks; sublists attach as children of the list item */
  private renderList(node: Node, ordered: boolean): string[] {
    const ids: string[] = [];
    for (const item of node.children) {
      if (item.token.type !== "list_item_open") continue;
      // The first paragraph in a list item is its own text; other child blocks (including sublists) go into children
      let elements: TextElement[] = [];
      let todoDone: boolean | null = null;
      const childIds: string[] = [];
      let ownTextTaken = false;
      for (const sub of item.children) {
        if (!ownTextTaken && sub.token.type === "paragraph_open") {
          const kids = sub.children[0]?.token.children ?? [];
          elements = inlineElements(kids);
          // Task list: first text starts with [ ] / [x]
          const first = elements[0];
          if (first && "text_run" in first) {
            const m = first.text_run.content.match(/^\[([ xX])\]\s+/);
            if (m) {
              todoDone = m[1] !== " ";
              first.text_run.content = first.text_run.content.slice(m[0].length);
              if (!first.text_run.content) elements.shift();
            }
          }
          ownTextTaken = true;
        } else {
          childIds.push(...this.renderNode(sub));
        }
      }
      const id =
        todoDone !== null
          ? this.textBlock(T.todo, "todo", elements, { done: todoDone })
          : this.textBlock(ordered ? T.ordered : T.bullet, ordered ? "ordered" : "bullet", elements);
      if (childIds.length > 0) this.blocks.get(id)!.children = childIds;
      ids.push(id);
    }
    return ids;
  }

  /** Table: cells are row-major; one table_cell per cell, containing a single rich text block */
  private renderTable(node: Node): string[] {
    const rows: TextElement[][][] = [];
    const walkRows = (n: Node) => {
      for (const child of n.children) {
        if (child.token.type === "tr_open") {
          const row: TextElement[][] = [];
          for (const cell of child.children) {
            if (cell.token.type === "th_open" || cell.token.type === "td_open") {
              row.push(inlineElements(cell.children[0]?.token.children ?? []));
            }
          }
          rows.push(row);
        } else {
          walkRows(child); // thead / tbody
        }
      }
    };
    walkRows(node);
    const cols = Math.max(...rows.map((r) => r.length), 0);
    if (rows.length === 0 || cols === 0) return [];

    // Table block count = 1 + rows×cols×2; beyond the per-call creation limit, degrade to a code block to preserve the content
    if (1 + rows.length * cols * 2 > 45) {
      const text = rows
        .map((r) => `| ${r.map(cellPlain).join(" | ")} |`)
        .join("\n");
      return [this.textBlock(T.code, "code", [run(text, {})], { language: 39, wrap: false })];
    }

    const cellIds: string[] = [];
    for (const row of rows) {
      for (let c = 0; c < cols; c++) {
        const inner = this.textBlock(T.text, "text", row[c] ?? []);
        cellIds.push(
          this.add({ block_type: T.tableCell, table_cell: {}, children: [inner] })
        );
      }
    }
    return [
      this.add({
        block_type: T.table,
        table: { property: { row_size: rows.length, column_size: cols } },
        children: cellIds,
      }),
    ];
  }
}

function cellPlain(elements: TextElement[]): string {
  return elements
    .map((el) => ("text_run" in el ? el.text_run.content : `$${el.equation.content}$`))
    .join("")
    .replaceAll("\n", " ")
    .replaceAll("|", "\\|");
}

/** Block count of a subtree (including itself), used to cap per-call size when batching */
export function subtreeSize(build: MdBuild, id: string): number {
  const block = build.blocks.get(id);
  if (!block) return 0;
  let n = 1;
  for (const c of block.children ?? []) n += subtreeSize(build, c);
  return n;
}

/** Collect all blocks of a top-level block's subtree (to describe to the create API) */
export function collectSubtree(build: MdBuild, id: string, out: OutBlock[]): void {
  const block = build.blocks.get(id);
  if (!block) return;
  out.push(block);
  for (const c of block.children ?? []) collectSubtree(build, c, out);
}

export function markdownToFeishuBlocks(source: string): MdBuild {
  const md = new MarkdownIt({ html: true, linkify: false });
  md.disable("lheading"); // consistent with the editor and preview: no Setext underline headings
  md.use(intrawordStarPlugin); // same: the single * in `3*2` is multiplication
  const tokens = md.parse(source, {});
  return new Builder().build(buildTree(tokens));
}
