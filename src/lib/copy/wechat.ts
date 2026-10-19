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
  /** Mac window style for code blocks */
  macCode?: boolean;
  /** Turn external links into end-of-article references */
  linkFootnote?: boolean;
  /**
   * Video handling: WeChat strips <video> on paste, so by default it degrades to a cover placeholder image + replacement notice;
   * "keep" keeps the real video (for cases that can play it, like HTML export)
   */
  videoMode?: "placeholder" | "keep";
}

const WECHAT_HOST = /^https?:\/\/mp\.weixin\.qq\.com\//i;

/** External links to footnotes: replaced in the body with a 「文字[n]」-style superscript, with a reference list appended at the end */
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
    // Record each link only once
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
  title.textContent = "参考链接"; // i18n-ignore content format written into export/copy output, stays in Chinese for now
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
 * Convert newlines and spaces inside code blocks to <br> and &nbsp;.
 * The WeChat editor collapses whitespace inside pre on paste, so explicit conversion is needed to keep indentation and line breaks.
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
 * First line of the video placeholder notice.
 * 「发送到公众号草稿」 (Send to WeChat drafts) counts how many times it appears in the final HTML to tell how many videos didn't make it over,
 * so both places share this one literal and copy changes can't drift apart.
 * Note: it must not contain 「封面」 (cover) -- that side treats notices containing 「封面」 as a cover-not-set problem.
 */
export const VIDEO_PLACEHOLDER_MARK = "⚠️ 此处有视频，还没有插入"; // i18n-ignore content format written into export/copy output, stays in Chinese for now

/** Second line of the notice: tells people how to replace this whole block */
const VIDEO_PLACEHOLDER_HINT = "发表前请在公众号后台点「插入视频」，替换掉这一整块"; // i18n-ignore content format written into export/copy output, stays in Chinese for now

/** How many video placeholder blocks are in the laid-out HTML */
export function countVideoPlaceholders(html: string): number {
  return html.split(VIDEO_PLACEHOLDER_MARK).length - 1;
}

/**
 * Video fallback: the WeChat editor strips <video> entirely on paste (videos can only be added via 「插入视频」 (Insert video) in the backend),
 * so replace it with a cover placeholder + a prominent yellow warning block, keeping the layout intact and showing the author exactly where a video is missing.
 * The two lines are "text + <br> + span" rather than two <p>s: the span only needs inline font-size/font-weight,
 * which WeChat leaves alone; a <p> would fight the base styles' margin/text-align.
 */
function transformVideos(root: HTMLElement): void {
  for (const video of Array.from(root.querySelectorAll("video"))) {
    const section = document.createElement("section");
    section.className = "video-placeholder";
    const poster = video.getAttribute("poster");
    if (poster) {
      const img = document.createElement("img");
      img.src = poster;
      img.alt = "视频封面"; // i18n-ignore content format written into export/copy output, stays in Chinese for now
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
 * Chrome drops the outermost section and its inline styles when copying a selection, so top-level blocks lose the theme's font size/line height/color
 * (line height falls back to normal); copy those properties from the root onto each top-level block explicitly, without overriding values the block already has.
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
 * WeChat's 「内容结构检测」 (content structure check) counts lines via Range.getClientRects(): inline elements (strong/em/span/br...)
 * split a line into multiple rects, so the computed line height comes out too small and it falsely reports "line height smaller than font size".
 * It only checks blocks with direct text children (and skips spans), so wrapping bare text in mixed blocks in attribute-less spans
 * leaves the block with no direct text and the check skips it; plain-text paragraphs stay as they are.
 *
 * Code blocks need wrapping too: highlighted code mixes "bare text + colored spans + <br>" and gets falsely flagged as well;
 * and when 「继续插入」 (Continue inserting) is clicked in the dialog, WeChat strips the flagged elements' inline styles, so code's font size, monospace font
 * and background all vanish and the block degrades into body-font plain text. Whitespace in pre matters, so even whitespace-only text nodes get wrapped.
 */
const MIXED_TEXT_BLOCKS =
  "p, h1, h2, h3, h4, h5, h6, li, td, th, div, section, blockquote, figcaption, pre > code";

function wrapMixedText(root: HTMLElement): void {
  const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>(MIXED_TEXT_BLOCKS))];
  for (const el of candidates) {
    const inCode = el.tagName === "CODE";
    if (!inCode && el.closest("pre")) continue;
    if (el.children.length === 0) continue;
    const texts = Array.from(el.childNodes).filter(
      (n): n is Text =>
        n.nodeType === Node.TEXT_NODE && (inCode || (n.textContent ?? "").trim().length > 0)
    );
    for (const text of texts) {
      const span = document.createElement("span");
      text.replaceWith(span);
      span.appendChild(text);
    }
  }
}

/** WeChat drops class/id/data-*, so remove them all before copying to reduce size */
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
 * Builds HTML that can be pasted straight into the WeChat Official Account editor:
 * render → sanitize → links to footnotes → escape code block whitespace → inline styles → strip attributes
 * Formulas are already inline SVG, so they need no extra handling.
 */
export async function buildWechatHtml(
  markdown: string,
  opts: WechatBuildOptions
): Promise<string> {
  await ensureMathJax();
  // Inline local images from a disk library as base64: WeChat can't access local files, and broken images cause paste problems
  const source = await inlineAttachments(markdown);
  const html = sanitizeHtml(renderMarkdown(source, { macCode: opts.macCode }));
  const root = document.createElement("section");
  root.id = "nice";
  // Attach to a detached DocumentFragment before filling in content: theme selectors all start with #nice,
  // and fully detached nodes can't be found by id in some DOM implementations (jsdom in unit tests, for one),
  // so querySelectorAll would come up empty and no styles would be inlined. A fragment fixes it, with no change in browser behavior.
  document.createDocumentFragment().appendChild(root);
  root.innerHTML = html;

  if (opts.linkFootnote) transformLinks(root);
  transformCodeBlocks(root);
  if (opts.videoMode !== "keep") transformVideos(root);

  const cssLayers = [BASE_CSS, opts.codeCss, opts.themeCss];
  if (opts.customCss?.trim()) cssLayers.push(opts.customCss);
  inlineStyles(root, cssLayers);
  propagateRootStyles(root);

  // WeChat article bodies have their own page margins and a dark mode: light themes drop the root's horizontal padding and background
  // to avoid double indentation and let WeChat's dark mode take over the background (dark themes keep their own background and padding)
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
