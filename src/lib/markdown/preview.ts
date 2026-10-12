import { parseMarkdown, type RenderEnv } from "./renderer";
import { sanitizeFragment, sanitizeHtml } from "./sanitize";

export interface PreviewBlock {
  /** 已清洗的完整块；行号相对 lineOffset，插入换行不会让后续块的缓存失效。 */
  html: string;
  /** 原生 HTML 以 null 表示：其中用户自写的 data-line 必须原样保留。 */
  lineOffset: number | null;
}

/**
 * 先解析全文，保留目录、脚注和引用链接的跨块语义，再按顶层 token 分组。
 * 列表、表格、引用等始终整块渲染；不增加容器，主题的父子选择器保持原样。
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

/** 每个预览只保留当前这版的清洗结果，卸载即释放，不积攒编辑历史。 */
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
      // 首次打开一次清洗整批，避免每个小段落都创建一个 DOMPurify 文档。
      // section 只在离屏拆分时使用，绝不会进入预览；原生 HTML 不走这条分块路径。
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

/** 从已清洗的 HTML 建立 DOM 和相对行号索引；后续移行只改属性，不重建图片/视频。 */
function mountBlock(block: PreviewBlock, fragment: ParentNode): MountedBlock {
  const anchors = block.lineOffset === null ? [] : Array.from(fragment.querySelectorAll("[data-line]"), (el) => ({
    el,
    line: Number(el.getAttribute("data-line")),
  }));
  return { ...block, lineOffset: null, nodes: Array.from(fragment.childNodes), anchors };
}

/** 新块也一次解析成离屏节点，长文首屏不会为几千个小块分别调用 HTML 解析器。 */
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
 * 复用相同块的 DOM，只插入/移除变化部分。相同内容按原顺序配对，重复段落不会串位。
 * 不插入包装元素或定位注释，最终 DOM 与原来的整篇 innerHTML 一致。
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
    // 先移走已变化的旧块；否则一个段落变了会把后面的所有未变节点逐个搬到它前面。
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
