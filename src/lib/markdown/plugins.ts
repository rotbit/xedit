import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

// —— 标题结构化 ——
// 输出 <h2><span class="prefix"></span><span class="content">标题</span><span class="suffix"></span></h2>
// 微信会丢弃伪元素，主题用真实的 prefix/suffix 节点做装饰才能在公众号里保留。
export function headingPlugin(md: MarkdownIt): void {
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token.map) token.attrSet("data-line", String(token.map[0]));
    return `${self.renderToken(tokens, idx, options)}<span class="prefix"></span><span class="content">`;
  };
  md.renderer.rules.heading_close = (tokens, idx) =>
    `</span><span class="suffix"></span></${tokens[idx].tag}>\n`;
}

// —— 独立成段的图片转 figure，alt 文本作为图注 ——
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
    const src = md.utils.escapeHtml(token.attrGet("src") ?? "");
    const alt = md.utils.escapeHtml(token.content ?? "");
    const title = token.attrGet("title");
    const caption = token.content || title || "";
    const titleAttr = title ? ` title="${md.utils.escapeHtml(title)}"` : "";
    // 是否在 figure 内由父 token 决定；figure 内输出图注
    const inFigure = tokens.length === 1;
    const img = `<img src="${src}" alt="${alt}"${titleAttr}>`;
    if (inFigure && caption) {
      return `${img}<figcaption>${md.utils.escapeHtml(caption)}</figcaption>`;
    }
    return img;
  };
}

// —— [toc] 目录 ——
// 单独一行 [toc]（不区分大小写）替换为静态目录列表（公众号内无法跳转，仅展示层级）。
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

    let html = `<section class="table-of-contents"><p class="toc-title">目录</p><ul>`;
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

// —— 块级元素写入 data-line，用于编辑器与预览的同步滚动 ——
export function lineMapPlugin(md: MarkdownIt): void {
  md.core.ruler.push("line_map", (state) => {
    const walk = (tokens: Token[]) => {
      for (const token of tokens) {
        if (token.map && token.nesting === 1 && !token.attrGet("data-line")) {
          token.attrSet("data-line", String(token.map[0]));
        }
      }
    };
    walk(state.tokens);
  });
}
