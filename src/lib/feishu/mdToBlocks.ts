import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { CODE_LANG } from "./markdown";

/**
 * Markdown → 飞书 docx 块树（markdown.ts 的反向）。
 * 输出为「创建嵌套块」接口的形状：顶层块 id 列表 + 全量块数组（临时 id 互相引用），
 * 图片先占位（创建后由推送流程上传素材再回填 token）。
 * 覆盖与拉取方向对称的类型：标题/段落/列表/待办/引用/代码块/分割线/图片/表格。
 */

export interface OutBlock {
  block_id: string;
  block_type: number;
  children?: string[];
  [payload: string]: unknown;
}

export interface MdBuild {
  /** 页面顶层块 id（有序） */
  children: string[];
  /** 全部块（含嵌套），按临时 id 引用 */
  blocks: Map<string, OutBlock>;
  /** 图片占位块 id → 原始 URL 与替代文案（按文档顺序） */
  images: { blockId: string; url: string; alt: string }[];
}

// 与 markdown.ts 的 B 常量一致的写方向子集
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

/** 语言标记 → 飞书 code 块枚举；补充几个常见别名 */
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
  link?: { url: string };
}

type TextElement =
  | { text_run: { content: string; text_element_style?: ElementStyle } }
  | { equation: { content: string } };

/** $tex$ 判定为公式的条件：含 TeX 特征字符，避免把「$5 和 $10」这类金额误判 */
const EQUATION_RE = /\$([^$\n]{1,200}?)\$/g;
const looksLikeTex = (s: string): boolean => /[\\^_{}]/.test(s);

/** 文本切出行内公式；纯文本原样落 text_run */
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
  if (style.link) s.link = style.link;
  return {
    text_run: {
      content,
      ...(Object.keys(s).length > 0 ? { text_element_style: s } : {}),
    },
  };
}

/** inline token 的 children → 飞书富文本元素；行内图片降级为链接 */
function inlineElements(children: Token[] | null): TextElement[] {
  const out: TextElement[] = [];
  const style: ElementStyle = {};
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
        // 行内混排的图片没有块位置，降级为链接（独占一段的图片在块层单独处理）
        const src = tk.attrGet("src") ?? "";
        const alt = tk.content || "图片";
        if (src) {
          out.push(run(alt, { ...style, link: { url: encodeURIComponent(src) } }));
        }
        break;
      }
      case "softbreak":
      case "hardbreak":
        out.push(run("\n", style));
        break;
      case "html_inline":
        if (/^<br\s*\/?>$/i.test(tk.content.trim())) out.push(run("\n", style));
        else emitText(out, tk.content, style);
        break;
      default:
        if (tk.content) emitText(out, tk.content, style);
    }
  }
  return out;
}

/** markdown-it 扁平 token 流 → 按 _open/_close 配对還原的节点树 */
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

  // 不用 Omit<OutBlock,...>：索引签名会让 Omit 丢掉 block_type 的必填约束
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

  /** 渲染兄弟节点序列，返回生成的块 id 列表 */
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
        // 容错：裸 inline（正常都包在 paragraph/heading 里）
        return [this.textBlock(T.text, "text", inlineElements(tk.children))];
      default:
        // 未覆盖的容器类型：拍平渲染子节点，绝不丢正文
        if (node.children.length > 0) return this.renderSiblings(node.children);
        return [];
    }
  }

  /** 段落：独占的图片拆成 image 块，其余走富文本 */
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

  /** 列表：待办语法（[ ]/[x] 前缀）转 todo 块；子列表挂为列表项的 children */
  private renderList(node: Node, ordered: boolean): string[] {
    const ids: string[] = [];
    for (const item of node.children) {
      if (item.token.type !== "list_item_open") continue;
      // 列表项内第一个段落是自身正文，其余子块（含子列表）挂到 children
      let elements: TextElement[] = [];
      let todoDone: boolean | null = null;
      const childIds: string[] = [];
      let ownTextTaken = false;
      for (const sub of item.children) {
        if (!ownTextTaken && sub.token.type === "paragraph_open") {
          const kids = sub.children[0]?.token.children ?? [];
          elements = inlineElements(kids);
          // 任务列表：首个文本以 [ ] / [x] 开头
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

  /** 表格：cells 行主序；每格一个 table_cell，内容为单个富文本块 */
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

    // 表格块数 = 1 + 行×列×2，超过单次创建上限就降级成代码块保内容
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

/** 子树块数（含自身），分批时控制单次调用规模 */
export function subtreeSize(build: MdBuild, id: string): number {
  const block = build.blocks.get(id);
  if (!block) return 0;
  let n = 1;
  for (const c of block.children ?? []) n += subtreeSize(build, c);
  return n;
}

/** 收集某顶层块子树的全部块（描述给创建接口） */
export function collectSubtree(build: MdBuild, id: string, out: OutBlock[]): void {
  const block = build.blocks.get(id);
  if (!block) return;
  out.push(block);
  for (const c of block.children ?? []) collectSubtree(build, c, out);
}

export function markdownToFeishuBlocks(source: string): MdBuild {
  const md = new MarkdownIt({ html: true, linkify: false });
  const tokens = md.parse(source, {});
  return new Builder().build(buildTree(tokens));
}
