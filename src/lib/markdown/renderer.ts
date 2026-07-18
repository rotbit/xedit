import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";
import { mathPlugin } from "./math";
import { headingPlugin, figurePlugin, tocPlugin, lineMapPlugin } from "./plugins";

export interface RenderEnv {
  /** 代码块使用 Mac 窗口风格 */
  macCode?: boolean;
}

function createMd(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
  });

  md.use(footnote);
  md.use(taskLists, { label: false });
  md.use(mathPlugin);
  md.use(headingPlugin);
  md.use(figurePlugin);
  md.use(tocPlugin);
  md.use(lineMapPlugin);

  md.renderer.rules.fence = (tokens, idx, _options, env: RenderEnv) => {
    const token = tokens[idx];
    const info = token.info.trim();
    const lang = info.split(/\s+/)[0] || "";
    let code: string;
    if (lang && hljs.getLanguage(lang)) {
      code = hljs.highlight(token.content, { language: lang, ignoreIllegals: true }).value;
    } else {
      code = md.utils.escapeHtml(token.content);
    }
    // 去掉末尾多余换行
    code = code.replace(/\n$/, "");
    const line = token.map ? ` data-line="${token.map[0]}"` : "";
    const macClass = env?.macCode ? " mac-code" : "";
    return `<pre class="code-block${macClass}"${line}><code class="hljs${lang ? ` language-${lang}` : ""}">${code}</code></pre>\n`;
  };

  // 表格外包一层可横向滚动的容器（公众号中宽表格需要）
  md.renderer.rules.table_open = (tokens, idx) => {
    const line = tokens[idx].map ? ` data-line="${tokens[idx].map![0]}"` : "";
    return `<section class="table-container"${line}><table>`;
  };
  md.renderer.rules.table_close = () => `</table></section>\n`;

  return md;
}

let mdInstance: MarkdownIt | null = null;

export function renderMarkdown(src: string, env: RenderEnv = {}): string {
  if (!mdInstance) mdInstance = createMd();
  return mdInstance.render(src, env);
}
