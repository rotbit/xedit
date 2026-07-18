import { renderMarkdown } from "@/lib/markdown/renderer";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { sanitizeHtml } from "@/lib/markdown/sanitize";

/**
 * 构建适合粘贴到知乎编辑器的 HTML。
 * 知乎会重新排版并忽略几乎所有样式，因此只保留语义结构：
 * - 公式转为知乎公式图片（eeimg），知乎会识别并转回可编辑公式
 * - 代码块保留 pre>code，知乎会重新高亮
 * - 链接保留原始 <a>
 */
export async function buildZhihuHtml(markdown: string): Promise<string> {
  await ensureMathJax();
  // 渲染结果先经 DOMPurify 消毒再写入 DOM
  const html = sanitizeHtml(renderMarkdown(markdown, { macCode: false }));
  const root = document.createElement("div");
  root.innerHTML = html;

  // 公式 → 知乎公式图片
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

  // figure → 普通段落图片（知乎不识别 figcaption）
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

  // 标题中的 prefix/suffix 装饰节点去掉，保留纯文本
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
