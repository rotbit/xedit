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

/** 高亮按原文复用；同时限制条数和 UTF-16 字节估算，长代码的历史版本不能占满内存。 */
const highlightCache = new Map<string, string>();
const HIGHLIGHT_CACHE_MAX = 300;
const HIGHLIGHT_CACHE_BYTES = 4 * 1024 * 1024;
let highlightBytes = 0;
function highlightFence(lang: string, source: string): string {
  // 语言与源码之间用 NUL 分隔：源码里不可能出现 NUL，换成空格或换行都有可能被内容本身撞出同键。
  const key = `${lang}\0${source}`;
  const hit = highlightCache.get(key);
  if (hit !== undefined) {
    // 最近用过的移到末尾，持续使用的代码块不会被新条目先淘汰。
    highlightCache.delete(key);
    highlightCache.set(key, hit);
    return hit;
  }
  const value = hljs.highlight(source, { language: lang, ignoreIllegals: true }).value;
  const bytes = (key.length + value.length) * 2;
  if (bytes > HIGHLIGHT_CACHE_BYTES) return value;
  while (highlightCache.size >= HIGHLIGHT_CACHE_MAX || highlightBytes + bytes > HIGHLIGHT_CACHE_BYTES) {
    const [oldKey, oldValue] = highlightCache.entries().next().value!;
    highlightBytes -= (oldKey.length + oldValue.length) * 2;
    highlightCache.delete(oldKey);
  }
  highlightCache.set(key, value);
  highlightBytes += bytes;
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

  // 原生 HTML 可能跨 Markdown 块开闭标签，必须整体清洗、整体解析 DOM。
  // 插在 inline 后、其它插件改造前：目录、空行和任务框生成的完整 HTML 不算原生 HTML。
  md.core.ruler.after("inline", "raw_html_context", (state) => {
    state.env.hasRawHtml = state.tokens.some(
      (token) => token.type === "html_block" || token.children?.some((child) => child.type === "html_inline")
    );
  });

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
export function parseMarkdown(src: string, env: RenderEnv = {}) {
  if (!mdInstance) mdInstance = createMd();
  // frontmatter 是给机器看的元数据，不该出现在公众号正文里：预览、复制、导出共用这一个入口，
  // 一处剥掉就三处干净。剥掉之后 markdown-it 从 0 重新数行，于是把 frontmatter 占的行数
  // 作为 lineOffset 透进去，data-line 仍是编辑器里的真实行号（见 lineMapPlugin），
  // 同步滚动不再整体偏那几行
  const fm = parseFrontmatter(src);
  // 被剥掉那段里有几个换行就是几行（收尾 `---` 在文末时没有换行，正文也已经空了）
  const renderEnv: RenderEnv & { hasRawHtml?: boolean } = fm
    ? { ...env, lineOffset: src.slice(0, fm.end).split("\n").length - 1 }
    : { ...env };
  const tokens = mdInstance.parse(fm?.body ?? src, renderEnv);
  return { md: mdInstance, tokens, env: renderEnv };
}

/** 复制、导出仍返回完整 HTML，与预览共用同一份解析器和渲染规则。 */
export function renderMarkdown(src: string, env: RenderEnv = {}): string {
  const parsed = parseMarkdown(src, env);
  return parsed.md.renderer.render(parsed.tokens, parsed.md.options, parsed.env);
}
