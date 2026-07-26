import { renderMarkdown } from "@/lib/markdown/renderer";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
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
 * 视频降级：公众号编辑器粘贴时会整个剥掉 <video>（视频只能在后台用「插入视频」添加），
 * 换成封面占位图 + 提示行，粘贴后版面不塌、作者一眼知道哪里要补。
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
    note.textContent = "📹 此处有视频 — 请在公众号后台点「插入视频」替换本占位";
    section.appendChild(note);
    video.replaceWith(section);
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
  const html = sanitizeHtml(renderMarkdown(markdown, { macCode: opts.macCode }));
  const root = document.createElement("section");
  root.id = "nice";
  root.innerHTML = html;

  if (opts.linkFootnote) transformLinks(root);
  transformCodeBlocks(root);
  if (opts.videoMode !== "keep") transformVideos(root);

  const cssLayers = [BASE_CSS, opts.codeCss, opts.themeCss];
  if (opts.customCss?.trim()) cssLayers.push(opts.customCss);
  inlineStyles(root, cssLayers);

  // 公众号正文自带页边距、且有深色模式：白底主题去掉根部横向内边距与底色，
  // 避免正文被双重内缩，也让公众号深色模式能正常接管底色（深色主题保留自己的底与边距）
  const bg = root.style.backgroundColor.replace(/\s+/g, "").toLowerCase();
  if (!bg || bg === "#ffffff" || bg === "rgb(255,255,255)" || bg === "white") {
    root.style.backgroundColor = "";
    root.style.paddingLeft = "0";
    root.style.paddingRight = "0";
  }

  cleanAttributes(root);
  return root.outerHTML;
}
