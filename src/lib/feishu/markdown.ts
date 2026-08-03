import type { FeishuBlock } from "./api";
import { hexOfFeishuFontColor } from "./colors";

/**
 * 飞书 docx 块树 → Markdown。
 * 块以扁平数组返回（block_id + parent_id + children id 列表），根是 page 块；
 * 覆盖常见可转换类型，转不动的（多维表格/电子表格/画板等）落一行占位引用，绝不丢正文。
 */

// block_type 数字枚举（官方文档「块数据结构」）
const B = {
  page: 1,
  text: 2,
  h1: 3, // 3-11 = heading1-9
  h9: 11,
  bullet: 12,
  ordered: 13,
  code: 14,
  quote: 15,
  todo: 17,
  callout: 19,
  divider: 22,
  grid: 24,
  gridColumn: 25,
  image: 27,
  table: 31,
  tableCell: 32,
  quoteContainer: 34,
} as const;

/** code 块 language 数字枚举 → 代码围栏语言标记（常用子集，缺省回落纯文本）；
 *  mdToBlocks 反向转换共用（取反做 语言标记 → 枚举） */
export const CODE_LANG: Record<number, string> = {
  1: "", 7: "bash", 8: "csharp", 9: "cpp", 10: "c", 12: "css", 15: "dart",
  18: "dockerfile", 22: "go", 24: "html", 28: "json", 29: "java", 30: "javascript",
  32: "kotlin", 33: "latex", 36: "lua", 38: "makefile", 39: "markdown", 43: "php",
  46: "powershell", 48: "protobuf", 49: "python", 50: "r", 52: "ruby", 53: "rust",
  55: "scss", 56: "sql", 57: "scala", 60: "shell", 61: "swift", 63: "typescript",
  66: "xml", 67: "yaml", 68: "cmake", 69: "diff", 71: "graphql", 75: "toml",
};

/** 无法转换的块类型 → 占位文案里的名称 */
const UNSUPPORTED_NAME: Record<number, string> = {
  18: "多维表格", 20: "群卡片", 21: "流程图", 23: "文件附件", 26: "内嵌网页",
  28: "小组件", 29: "思维笔记", 30: "电子表格", 33: "视图", 35: "任务",
  36: "OKR", 40: "文档小组件", 41: "Jira 卡片", 43: "画板", 48: "链接预览卡片",
};

interface TextElementStyle {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  inline_code?: boolean;
  /** 飞书字体色枚举（FontColor 1~7） */
  text_color?: number;
  link?: { url?: string };
}

interface TextElement {
  text_run?: { content?: string; text_element_style?: TextElementStyle };
  equation?: { content?: string };
  mention_doc?: { url?: string };
  mention_user?: unknown;
}

interface TextPayload {
  elements?: TextElement[];
  style?: { done?: boolean; language?: number; sequence?: string };
}

export interface ConvertContext {
  /** 图片 token → 转存后的 URL；失败返回 null（会落占位文案） */
  resolveImage: (token: string) => Promise<string | null>;
}

function decodeUrl(u: string): string {
  try {
    return decodeURIComponent(u);
  } catch {
    return u;
  }
}

/** 行内元素拼接：样式包裹顺序为 链接( 删除线( 粗斜 ) )，行内代码不再嵌套其他标记 */
function inline(elements: TextElement[] | undefined): string {
  if (!elements) return "";
  let out = "";
  for (const el of elements) {
    if (el.text_run) {
      const content = el.text_run.content ?? "";
      const s = el.text_run.text_element_style ?? {};
      let piece = content;
      if (s.inline_code) {
        piece = `\`${content.replaceAll("`", "'")}\``;
      } else if (piece.trim()) {
        // 标记紧贴非空白字符才有效：样式只包住正文，两侧空白留在标记外
        const lead = piece.match(/^\s*/)?.[0] ?? "";
        const tail = piece.match(/\s*$/)?.[0] ?? "";
        let core = piece.trim();
        if (s.bold && s.italic) core = `***${core}***`;
        else if (s.bold) core = `**${core}**`;
        else if (s.italic) core = `*${core}*`;
        if (s.strikethrough) core = `~~${core}~~`;
        const colorHex = hexOfFeishuFontColor(s.text_color);
        if (colorHex) core = `<span style="color:${colorHex}">${core}</span>`;
        piece = lead + core + tail;
      }
      if (s.link?.url) piece = `[${piece || "链接"}](${decodeUrl(s.link.url)})`;
      out += piece;
    } else if (el.equation) {
      const tex = (el.equation.content ?? "").replace(/\s+/g, " ").trim();
      if (tex) out += `$${tex}$`;
    } else if (el.mention_doc) {
      const url = decodeUrl(el.mention_doc.url ?? "");
      out += url ? `[飞书文档](${url})` : "";
    } else if (el.mention_user) {
      out += "@成员";
    }
    // reminder / inline file 等其余行内元素没有可迁移的正文，跳过
  }
  return out;
}

function textPayload(block: FeishuBlock): TextPayload {
  const keys = [
    "text", "heading1", "heading2", "heading3", "heading4", "heading5",
    "heading6", "heading7", "heading8", "heading9",
    "bullet", "ordered", "code", "quote", "todo",
  ];
  for (const k of keys) {
    if (block[k]) return block[k] as TextPayload;
  }
  return {};
}

function quotePrefix(md: string): string {
  return md
    .split("\n")
    .map((l) => (l ? `> ${l}` : ">"))
    .join("\n");
}

function indent(md: string, pad: string): string {
  return md
    .split("\n")
    .map((l) => (l ? pad + l : l))
    .join("\n");
}

const isListType = (t: number): boolean =>
  t === B.bullet || t === B.ordered || t === B.todo;

class Converter {
  private map = new Map<string, FeishuBlock>();
  constructor(
    blocks: FeishuBlock[],
    private ctx: ConvertContext
  ) {
    for (const b of blocks) this.map.set(b.block_id, b);
  }

  async convert(): Promise<string> {
    const root = [...this.map.values()].find((b) => b.block_type === B.page);
    if (!root) return "";
    return this.renderChildren(root.children ?? [], 0);
  }

  /** 渲染兄弟块序列：列表项之间紧凑换行并维护有序编号，其余块之间空一行 */
  private async renderChildren(ids: string[], depth: number): Promise<string> {
    if (depth > 32) return "";
    const parts: { md: string; type: number }[] = [];
    let ordinal = 0;
    for (const id of ids) {
      const block = this.map.get(id);
      if (!block) continue;
      ordinal = block.block_type === B.ordered ? ordinal + 1 : 0;
      const md = await this.renderBlock(block, depth, ordinal);
      if (md) parts.push({ md, type: block.block_type });
    }
    let out = "";
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        const tight = isListType(parts[i].type) && isListType(parts[i - 1].type);
        out += tight ? "\n" : "\n\n";
      }
      out += parts[i].md;
    }
    return out;
  }

  private async renderBlock(
    block: FeishuBlock,
    depth: number,
    ordinal: number
  ): Promise<string> {
    const t = block.block_type;

    if (t === B.text) return inline(textPayload(block).elements);

    if (t >= B.h1 && t <= B.h9) {
      const level = Math.min(t - B.h1 + 1, 6); // h7-9 一律降为 h6
      return `${"#".repeat(level)} ${inline(textPayload(block).elements)}`;
    }

    if (t === B.bullet || t === B.ordered || t === B.todo) {
      const payload = textPayload(block);
      const marker =
        t === B.bullet
          ? "- "
          : t === B.ordered
            ? `${ordinal || 1}. `
            : payload.style?.done
              ? "- [x] "
              : "- [ ] ";
      let item = marker + inline(payload.elements);
      if (block.children?.length) {
        const sub = await this.renderChildren(block.children, depth + 1);
        if (sub) item += "\n" + indent(sub, " ".repeat(marker.length));
      }
      return item;
    }

    if (t === B.code) {
      const payload = textPayload(block);
      const lang = CODE_LANG[payload.style?.language ?? 0] ?? "";
      const body = (payload.elements ?? [])
        .map((el) => el.text_run?.content ?? "")
        .join("");
      const fence = body.includes("```") ? "````" : "```";
      return `${fence}${lang}\n${body.replace(/\n$/, "")}\n${fence}`;
    }

    if (t === B.quote) return quotePrefix(inline(textPayload(block).elements));

    if (t === B.quoteContainer || t === B.callout) {
      const body = await this.renderChildren(block.children ?? [], depth + 1);
      return body ? quotePrefix(body) : "";
    }

    if (t === B.divider) return "---";

    if (t === B.image) {
      const img = block.image as
        | { token?: string; caption?: { content?: string } }
        | undefined;
      if (!img?.token) return "";
      const url = await this.ctx.resolveImage(img.token);
      const alt = img.caption?.content?.trim() ?? "";
      return url ? `![${alt}](${url})` : "> （图片转存失败，请在飞书原文查看）";
    }

    if (t === B.table) return this.renderTable(block, depth);

    if (t === B.grid || t === B.gridColumn || t === B.tableCell) {
      // 布局容器：拍平直接渲染内容
      return this.renderChildren(block.children ?? [], depth + 1);
    }

    if (t === B.page) return "";

    const name = UNSUPPORTED_NAME[t];
    if (name) return `> （此处有暂不支持导入的飞书${name}，请在原文查看）`;
    return ""; // 目录、同步块等纯导航/装饰块静默跳过
  }

  /** 表格：children 为 table_cell 序列（行主序），按 column_size 切行；首行作表头 */
  private async renderTable(block: FeishuBlock, depth: number): Promise<string> {
    const prop = (block.table as { property?: { column_size?: number } } | undefined)
      ?.property;
    const cols = prop?.column_size ?? 0;
    const cellIds = block.children ?? [];
    if (cols <= 0 || cellIds.length === 0) return "";

    const cells: string[] = [];
    for (const id of cellIds) {
      const cell = this.map.get(id);
      const body = cell ? await this.renderChildren(cell.children ?? [], depth + 1) : "";
      cells.push(body.replaceAll("\n\n", "<br>").replaceAll("\n", "<br>").replaceAll("|", "\\|"));
    }
    const rows: string[][] = [];
    for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));

    const line = (r: string[]) =>
      `| ${Array.from({ length: cols }, (_, i) => r[i] ?? "").join(" | ")} |`;
    const out = [line(rows[0]), `| ${Array(cols).fill("---").join(" | ")} |`];
    for (const r of rows.slice(1)) out.push(line(r));
    return out.join("\n");
  }
}

export async function feishuBlocksToMarkdown(
  blocks: FeishuBlock[],
  ctx: ConvertContext
): Promise<string> {
  return new Converter(blocks, ctx).convert();
}
