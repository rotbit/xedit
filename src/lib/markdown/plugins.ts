import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { isVideoUrl, posterFromTitle } from "@/lib/media";
import { wikiLinkText } from "@/lib/wikiLink";
import { parseCalloutHead } from "@/lib/callout";

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

// —— 独立成段的图片/视频转 figure，alt 文本作为图注 ——
// 视频复用图片语法 ![说明](xx.mp4 "poster=封面URL")，按扩展名识别输出 <video>。
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
    const src = md.utils.escapeHtml(rawSrc);
    const alt = md.utils.escapeHtml(token.content ?? "");
    const title = token.attrGet("title");
    // 是否在 figure 内由父 token 决定；figure 内输出图注
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

// —— 保留多余空行 ——
// Markdown 把任意多个空行折叠成一个段落间隔，但公众号作者习惯用空行控制留白，
// 编辑器里看到的空行应与渲染效果一致：1 个空行是标准段落分隔，
// 第 2 个起每个空行输出一个空段落（<p><br></p>，公众号编辑器自身表示空行的方式）。
// 文首的空行没有分隔职责，每行都算留白。
export function blankLinePlugin(md: MarkdownIt): void {
  md.core.ruler.push("preserve_blank_lines", (state) => {
    const tokens = state.tokens;
    let depth = 0;
    let prevEnd = 0; // 上一个顶层块的结束行（不含尾随空行）
    let atStart = true;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (depth === 0 && token.nesting >= 0 && token.map) {
        const gap = token.map[0] - prevEnd;
        const extra = atStart ? gap : gap - 1;
        if (extra > 0) {
          const firstLine = atStart ? prevEnd : prevEnd + 1;
          let html = "";
          for (let n = 0; n < extra; n++) {
            html += `<p data-line="${firstLine + n}"><br></p>\n`;
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

// —— [[双向链接]] ——
// 输出 <span class="wikilink" data-wiki="目标">显示文字</span>，刻意不用 <a>：
// 站内链接出了 xedit 就没有意义，公众号/知乎的复制管线里一个 span 落地就是普通文字，
// 不会变成一条点不开的死链。点击由预览组件做事件委托（见 Preview.tsx）。
export function wikiLinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("link", "wikilink", (state, silent) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x5b || state.src.charCodeAt(start + 1) !== 0x5b) {
      return false;
    }
    const close = state.src.indexOf("]]", start + 2);
    if (close === -1 || close + 2 > state.posMax) return false;
    const body = state.src.slice(start + 2, close);
    // 不跨行、不允许嵌套 [[：与编辑器侧的 lezer 扩展保持同一套规则
    if (/[\r\n]/.test(body) || body.includes("[[")) return false;

    const bar = body.indexOf("|");
    const target = (bar === -1 ? body : body.slice(0, bar)).trim();
    if (!target) return false; // 空目标不成链接

    if (!silent) {
      const token = state.push("wikilink", "", 0);
      token.info = target; // 目标标题（用 info 而不是 meta：后者在类型上是 any）
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

// —— Obsidian 式提示块（Callout）——
// `> [!tip] 标题` 打头的引用块整体换成 <section class="callout callout-tip">，
// 并在最前面插一条 <section class="callout-title">。
// 用 section 不用 div：sanitize.ts 已放行 section，公众号粘贴也留得住 section。
// 规则挂在 core 的 inline 之前：此刻 blockquote 已经解析完、inline token 还是原始文本，
// 直接改 content 就够了，不必去拆已经建好的 children —— 顺带让标题里的 **粗体** 照常生效。
export function calloutPlugin(md: MarkdownIt): void {
  md.core.ruler.before("inline", "callout", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "blockquote_open") continue;
      if (tokens[i + 1]?.type !== "paragraph_open" || tokens[i + 2]?.type !== "inline") continue;

      const inline = tokens[i + 2];
      // breaks:true 下首段可能是「首行 \n 正文…」一整块，只拿第一行去认记号
      const br = inline.content.indexOf("\n");
      const head = parseCalloutHead(br === -1 ? inline.content : inline.content.slice(0, br));
      if (!head) continue;

      const open = tokens[i];
      open.tag = "section";
      open.attrSet("class", `callout callout-${head.type}`);
      open.attrSet("data-callout", head.type);
      // 配对的 blockquote_close 可能隔着好几层嵌套块，按 nesting 计数找回来一起换标签
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
        // 正文实际从下一行起，data-line 跟着挪一行，同步滚动才不会整块偏一行
        for (const t of [tokens[i + 1], inline]) {
          if (t.map) t.map = [t.map[0] + 1, t.map[1]];
        }
      } else {
        tokens.splice(i + 1, 3); // 首段只有记号行，留着就是个空 <p>
      }

      // 标题走真 token 而不是 html_block：它排在 inline 规则之前，
      // 这条 inline token 随后会被正常解析，标题里写 **粗体**、`代码` 都能渲染
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
