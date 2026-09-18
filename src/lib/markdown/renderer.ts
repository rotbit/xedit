/**
 * 公众号正文的 Markdown → HTML 渲染入口。预览、复制到公众号、导出三条路径都走 renderMarkdown，
 * 三者看到的结构因此完全一致，观感差异只由主题 CSS 承担。
 * 下面的插件注册顺序彼此有依赖（各处已标注原因），换顺序会改变输出结构。
 */
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
// 全量 highlight.js 带 190+ 语言、打包上 MB；common 集 35 种主流语言足够公众号场景，
// 冷门语言退化为无高亮的转义输出（fence 渲染里有 getLanguage 兜底）
import hljs from "highlight.js/lib/common";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import http from "highlight.js/lib/languages/http";
import nginx from "highlight.js/lib/languages/nginx";

hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("http", http);
hljs.registerLanguage("nginx", nginx);
import { parseFrontmatter } from "@/lib/frontmatter";
import { mathPlugin } from "./math";
import {
  headingPlugin,
  figurePlugin,
  tocPlugin,
  blankLinePlugin,
  lineMapPlugin,
  wikiLinkPlugin,
  calloutPlugin,
} from "./plugins";

/** 单次渲染的开关，由 renderMarkdown 透传给各 renderer 规则，不进全局状态。 */
export interface RenderEnv {
  /** 代码块使用 Mac 窗口风格 */
  macCode?: boolean;
  /** 内部用：frontmatter 剥掉的行数，data-line 要加回来（由 renderMarkdown 填，调用方不必给） */
  lineOffset?: number;
}

/** fence 高亮结果缓存：预览每次防抖触发都全文重渲，长文里代码高亮是最贵的一段，
 *  而两次渲染之间绝大多数代码块根本没变。键 = 语言+原文，先进先出限量（与 mathjax 缓存同思路） */
const highlightCache = new Map<string, string>();
const HIGHLIGHT_CACHE_MAX = 300;
function highlightFence(lang: string, source: string): string {
  // 语言与源码之间用 NUL 分隔：源码里不可能出现 NUL，换成空格或换行都有可能被内容本身撞出同键。
  const key = `${lang}\0${source}`;
  const hit = highlightCache.get(key);
  if (hit !== undefined) return hit;
  const value = hljs.highlight(source, { language: lang, ignoreIllegals: true }).value;
  if (highlightCache.size >= HIGHLIGHT_CACHE_MAX) {
    const oldest = highlightCache.keys().next().value;
    if (oldest !== undefined) highlightCache.delete(oldest);
  }
  highlightCache.set(key, value);
  return value;
}

/** 组装 MarkdownIt 实例；只在首次渲染时跑一次，之后复用（见 mdInstance）。 */
function createMd(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    // 编辑器里的换行所见即所得：单个回车即 <br>，与公众号写作习惯一致
    breaks: true,
  });
  // 与编辑器解析器保持一致：不认 Setext 下划线标题（详见 editorExtensions.ts）
  md.disable("lheading");

  md.use(footnote);
  md.use(taskLists, { label: false });
  md.use(mathPlugin);
  md.use(wikiLinkPlugin);
  // 放在 headingPlugin 之前：提示块要在标题/图注等规则动手之前把 blockquote 改造完
  md.use(calloutPlugin);
  md.use(headingPlugin);
  md.use(figurePlugin);
  md.use(tocPlugin);
  // 放在 toc/figure 之后：它们按相邻 token 模式匹配，先插空段落会打断结构
  md.use(blankLinePlugin);
  md.use(lineMapPlugin);

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

// 懒加载单例：实例本身可反复 render（状态都在 env 里），而注册十来个插件不便宜，所以只建一次
let mdInstance: MarkdownIt | null = null;

/** 把正文渲染成 HTML。src 允许带 frontmatter，会在这里剥掉（行号偏移一并补上）。 */
export function renderMarkdown(src: string, env: RenderEnv = {}): string {
  if (!mdInstance) mdInstance = createMd();
  // frontmatter 是给机器看的元数据，不该出现在公众号正文里：预览、复制、导出共用这一个入口，
  // 一处剥掉就三处干净。剥掉之后 markdown-it 从 0 重新数行，于是把 frontmatter 占的行数
  // 作为 lineOffset 透进去，data-line 仍是编辑器里的真实行号（见 lineMapPlugin），
  // 同步滚动不再整体偏那几行
  const fm = parseFrontmatter(src);
  if (!fm) return mdInstance.render(src, env);
  // 被剥掉那段里有几个换行就是几行（收尾 `---` 在文末时没有换行，正文也已经空了）
  const lineOffset = src.slice(0, fm.end).split("\n").length - 1;
  return mdInstance.render(fm.body, { ...env, lineOffset });
}
