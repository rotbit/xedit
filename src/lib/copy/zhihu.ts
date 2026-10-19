import { renderMarkdown } from "@/lib/markdown/renderer";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { sanitizeHtml } from "@/lib/markdown/sanitize";

/**
 * Build HTML suitable for pasting into the Zhihu editor.
 * Zhihu re-lays out the content and drops nearly all styling, so only semantic structure is kept:
 * - Formulas become Zhihu formula images (eeimg), which Zhihu recognizes and turns back into editable formulas
 * - Code blocks keep pre>code; Zhihu re-highlights them
 * - Links keep the original <a>
 */
export async function buildZhihuHtml(markdown: string): Promise<string> {
  await ensureMathJax();
  // Sanitize the rendered output with DOMPurify before writing it into the DOM
  const html = sanitizeHtml(renderMarkdown(markdown, { macCode: false }));
  const root = document.createElement("div");
  root.innerHTML = html;

  // Formulas → Zhihu formula images
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(".math"))) {
    const tex = el.dataset.tex ?? "";
    if (!tex) continue;
    const isBlock = el.classList.contains("math-block");
    const img = document.createElement("img");
    img.setAttribute("eeimg", "1");
    img.src = `//www.zhihu.com/equation?tex=${encodeURIComponent(isBlock ? tex + "\\\\" : tex)}`;
    img.alt = tex;
    if (isBlock) {
      const p = document.createElement("p");
      p.appendChild(img);
      el.replaceWith(p);
    } else {
      el.replaceWith(img);
    }
  }

  // Video: the Zhihu editor won't take an external <video> either, so fall back to the poster image + a hint (insert via Zhihu's video button)
  for (const video of Array.from(root.querySelectorAll("video"))) {
    const container = video.closest("figure") ?? video;
    const caption = container.querySelector("figcaption")?.textContent ?? "";
    const parts: HTMLElement[] = [];
    const poster = video.getAttribute("poster");
    if (poster) {
      const p = document.createElement("p");
      const img = document.createElement("img");
      img.src = poster;
      img.alt = caption || "视频封面"; // i18n-ignore part of the exported/copied content format; stays Chinese for now
      p.appendChild(img);
      parts.push(p);
    }
    const noteP = document.createElement("p");
    const em = document.createElement("em");
    em.textContent = caption
      ? `（此处有视频「${caption}」，请用知乎编辑器的视频按钮插入）` // i18n-ignore part of the exported/copied content format; stays Chinese for now
      : "（此处有视频，请用知乎编辑器的视频按钮插入）"; // i18n-ignore part of the exported/copied content format; stays Chinese for now
    noteP.appendChild(em);
    parts.push(noteP);
    container.replaceWith(...parts);
  }

  // figure → plain paragraph image (Zhihu doesn't recognize figcaption)
  for (const figure of Array.from(root.querySelectorAll("figure"))) {
    const img = figure.querySelector("img");
    const caption = figure.querySelector("figcaption")?.textContent ?? "";
    const p = document.createElement("p");
    if (img) p.appendChild(img);
    figure.replaceWith(p);
    if (caption) {
      const capP = document.createElement("p");
      const em = document.createElement("em");
      em.textContent = caption;
      capP.appendChild(em);
      p.after(capP);
    }
  }

  // Strip prefix/suffix decoration nodes from headings, keeping plain text
  for (const span of Array.from(
    root.querySelectorAll("h1 span, h2 span, h3 span, h4 span, h5 span, h6 span")
  )) {
    if (span.classList.contains("content")) {
      span.replaceWith(...Array.from(span.childNodes));
    } else {
      span.remove();
    }
  }

  return root.innerHTML;
}
