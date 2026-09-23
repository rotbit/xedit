import { renderMarkdown } from "@/lib/markdown/renderer";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { inlineAttachments } from "@/lib/localBackend/attachmentUrls";
import { inlineStyles } from "./inline";
import { BASE_CSS } from "@/lib/themes/base";

export interface WechatBuildOptions {
  themeCss: string;
  codeCss: string;
  customCss?: string;
  /** 代码块 Mac 窗口风格 */
  macCode?: boolean;
  /** 外部链接转为文末引用 */
  linkFootnote?: boolean;
  /**
   * 视频处理：公众号粘贴会剥掉 <video>，默认降级为封面占位图 + 替换提示；
   * "keep" 保留真视频（HTML 导出等能播放的场景用）
   */
  videoMode?: "placeholder" | "keep";
}

const WECHAT_HOST = /^https?:\/\/mp\.weixin\.qq\.com\//i;

/** 外链转脚注：正文里换成「文字[n]」上标，文末追加引用列表 */
function transformLinks(root: HTMLElement): void {
  const links = Array.from(root.querySelectorAll("a[href]")).filter((a) => {
    const href = a.getAttribute("href") ?? "";
    return /^https?:\/\//i.test(href) && !WECHAT_HOST.test(href);
  });
  if (links.length === 0) return;

  const refs: { text: string; href: string }[] = [];
  for (const a of links) {
    const href = a.getAttribute("href") ?? "";
    const text = a.textContent ?? href;
    // 同一链接只记一次
    let index = refs.findIndex((r) => r.href === href && r.text === text);
    if (index === -1) {
      refs.push({ text, href });
      index = refs.length - 1;
    }
    const span = document.createElement("span");
    span.className = "footnote-word";
    span.textContent = text;
    const sup = document.createElement("sup");
    sup.className = "footnote-num";
    sup.textContent = `[${index + 1}]`;
    const wrapper = document.createElement("span");
    wrapper.className = "footnote-ref";
    wrapper.appendChild(span);
    wrapper.appendChild(sup);
    a.replaceWith(wrapper);
  }

  const section = document.createElement("section");
  section.className = "footnote-refs";
  const title = document.createElement("p");
  title.className = "refs-title";
  title.textContent = "参考链接";
  section.appendChild(title);
  refs.forEach((r, i) => {
    const p = document.createElement("p");
    p.className = "footnote-item";
    p.textContent = `[${i + 1}] ${r.text}: ${r.href}`;
    section.appendChild(p);
  });
  root.appendChild(section);
}

/**
 * 代码块内的换行与空格转为 <br> 与 &nbsp;。
 * 微信编辑器粘贴时会合并 pre 内的空白，必须显式转换才能保住缩进与换行。
 */
function transformCodeBlocks(root: HTMLElement): void {
  const NBSP = " ";
  for (const code of Array.from(root.querySelectorAll("pre > code"))) {
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) textNodes.push(node as Text);

    for (const textNode of textNodes) {
      const text = textNode.nodeValue ?? "";
      if (!/[\n ]/.test(text)) continue;
      const frag = document.createDocumentFragment();
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (i > 0) frag.appendChild(document.createElement("br"));
        if (line) {
          frag.appendChild(document.createTextNode(line.replace(/ /g, NBSP)));
        }
      });
      textNode.replaceWith(frag);
    }
  }
}

/**
 * 视频占位块提示语的第一行。
 * 「发送到公众号草稿」那边靠数它在成品 HTML 里出现几次，来统计有几个视频没带过去，
 * 两处共用这一份字面量，改文案不会走偏。
 * 注意：里面不能出现「封面」二字——那边把含「封面」的提示当成封面没设好的问题。
 */
export const VIDEO_PLACEHOLDER_MARK = "⚠️ 此处有视频，还没有插入";

/** 提示语第二行：告诉人这一整块该怎么换掉 */
const VIDEO_PLACEHOLDER_HINT = "发表前请在公众号后台点「插入视频」，替换掉这一整块";

/** 排好版的 HTML 里有几个视频占位块 */
export function countVideoPlaceholders(html: string): number {
  return html.split(VIDEO_PLACEHOLDER_MARK).length - 1;
}

/**
 * 视频降级：公众号编辑器粘贴时会整个剥掉 <video>（视频只能在后台用「插入视频」添加），
 * 换成封面占位图 + 醒目的黄色警告块，粘贴后版面不塌、作者一眼看见哪里还欠一个视频。
 * 两行文案拆成「文本 + <br> + span」而不是两个 <p>：span 只需要内联 font-size/font-weight，
 * 公众号那边不会动它；<p> 还得跟基础样式的 margin/text-align 打架。
 */
function transformVideos(root: HTMLElement): void {
  for (const video of Array.from(root.querySelectorAll("video"))) {
    const section = document.createElement("section");
    section.className = "video-placeholder";
    const poster = video.getAttribute("poster");
    if (poster) {
      const img = document.createElement("img");
      img.src = poster;
      img.alt = "视频封面";
      section.appendChild(img);
    }
    const note = document.createElement("p");
    note.className = "video-note";
    note.appendChild(document.createTextNode(VIDEO_PLACEHOLDER_MARK));
    note.appendChild(document.createElement("br"));
    const hint = document.createElement("span");
    hint.className = "video-note-hint";
    hint.textContent = VIDEO_PLACEHOLDER_HINT;
    note.appendChild(hint);
    section.appendChild(note);
    video.replaceWith(section);
  }
}

/**
 * Chrome 用选区复制时会丢掉最外层 section 及其内联样式，顶层块会失去主题的字号/行高/颜色
 * （行高退回 normal），所以把根上这几项显式抄到每个顶层块上；块自己已有的值不覆盖。
 */
const ROOT_INHERITED_PROPS = ["font-size", "line-height", "color", "letter-spacing", "font-family"];

function propagateRootStyles(root: HTMLElement): void {
  for (const child of Array.from(root.children) as HTMLElement[]) {
    for (const prop of ROOT_INHERITED_PROPS) {
      const value = root.style.getPropertyValue(prop);
      if (value && !child.style.getPropertyValue(prop)) {
        child.style.setProperty(prop, value);
      }
    }
  }
}

/**
 * 公众号「内容结构检测」用 Range.getClientRects() 数行：行内元素（strong/em/span/br…）
 * 会把一行拆成多个矩形，算出来的行高偏小，误报「行高小于字体大小」。
 * 它只检查带直接文本子节点的块（且不查 span），所以把混排块里的裸文本包进无属性的 span，
 * 块本身就没有直接文本了，检测直接跳过；纯文本段落与 pre 内部保持原样。
 */
const MIXED_TEXT_BLOCKS = "p, h1, h2, h3, h4, h5, h6, li, td, th, div, section, blockquote, figcaption";

function wrapMixedText(root: HTMLElement): void {
  const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>(MIXED_TEXT_BLOCKS))];
  for (const el of candidates) {
    if (el.closest("pre")) continue;
    if (el.children.length === 0) continue;
    const texts = Array.from(el.childNodes).filter(
      (n): n is Text => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0
    );
    for (const text of texts) {
      const span = document.createElement("span");
      text.replaceWith(span);
      span.appendChild(text);
    }
  }
}

/** 微信会丢弃 class/id/data-*，复制前统一移除，减小体积 */
function cleanAttributes(root: HTMLElement): void {
  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of all) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name;
      if (
        name === "class" ||
        name === "id" ||
        name.startsWith("data-") ||
        name.startsWith("aria-")
      ) {
        el.removeAttribute(name);
      }
    }
  }
}

/**
 * 构建可直接粘贴进微信公众号编辑器的 HTML：
 * 渲染 → 消毒 → 外链转脚注 → 代码块空白转义 → 样式内联 → 清理属性
 * 公式已是内联 SVG，无需额外处理。
 */
export async function buildWechatHtml(
  markdown: string,
  opts: WechatBuildOptions
): Promise<string> {
  await ensureMathJax();
  // 磁盘文库里的本地图片内联成 base64：公众号那边拿不到本机文件，裂图会让粘贴出问题
  const source = await inlineAttachments(markdown);
  const html = sanitizeHtml(renderMarkdown(source, { macCode: opts.macCode }));
  const root = document.createElement("section");
  root.id = "nice";
  // 挂进一个游离的 DocumentFragment 再填内容：主题选择器一律以 #nice 开头，
  // 而完全孤立的节点在有些 DOM 实现里按 id 查不到（单测用的 jsdom 就是这样），
  // querySelectorAll 会整体落空、一条样式都内联不上。放进 fragment 即可，浏览器里行为不变。
  document.createDocumentFragment().appendChild(root);
  root.innerHTML = html;

  if (opts.linkFootnote) transformLinks(root);
  transformCodeBlocks(root);
  if (opts.videoMode !== "keep") transformVideos(root);

  const cssLayers = [BASE_CSS, opts.codeCss, opts.themeCss];
  if (opts.customCss?.trim()) cssLayers.push(opts.customCss);
  inlineStyles(root, cssLayers);
  propagateRootStyles(root);

  // 公众号正文自带页边距、且有深色模式：白底主题去掉根部横向内边距与底色，
  // 避免正文被双重内缩，也让公众号深色模式能正常接管底色（深色主题保留自己的底与边距）
  const bg = root.style.backgroundColor.replace(/\s+/g, "").toLowerCase();
  if (!bg || bg === "#ffffff" || bg === "rgb(255,255,255)" || bg === "white") {
    root.style.backgroundColor = "";
    root.style.paddingLeft = "0";
    root.style.paddingRight = "0";
  }

  wrapMixedText(root);
  cleanAttributes(root);
  return root.outerHTML;
}
