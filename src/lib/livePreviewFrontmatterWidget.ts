import { EditorView, WidgetType } from "@codemirror/view";
import { normalizeTag, parseFrontmatter } from "@/lib/frontmatter";
import { requestOpenTag } from "@/lib/tagEvents";

/**
 * 文首 YAML frontmatter 的即时渲染部件：一张只读的元信息卡片。
 *
 * 不隐藏、也不美化成正文的一部分——frontmatter 是给机器看的元数据，
 * 排成「键 值」两列的卡片正好把它和正文划清界限（Obsidian 的属性面板也是这个思路）。
 * 光标进入区间即还原源码（判定在 livePreviewBlocks.ts），所以卡片不必可编辑。
 *
 * DOM 全部用 textContent 拼，没有一处 innerHTML：frontmatter 里可能写着任何字符，
 * 这条路径上也就不需要再过一次 DOMPurify。
 */

/** 值归一成列表：数组原样，字符串按逗号/顿号/空白拆 */
function toList(value: string | string[]): string[] {
  return Array.isArray(value) ? value : value.split(/[,，、\s]+/).filter(Boolean);
}

/** tags 行渲染成与正文同款的标签胶囊，点击即筛文章 */
function fillTags(cell: HTMLElement, value: string | string[]): void {
  const items = toList(value);
  for (const item of items) {
    const tag = normalizeTag(item);
    if (!tag) continue;
    const pill = document.createElement("span");
    pill.className = "cm-lp-tag";
    pill.dataset.lpTag = tag;
    pill.title = `筛出 #${tag} 的文章`;
    pill.textContent = `#${tag}`;
    cell.appendChild(pill);
  }
  // 一个合法标签都没有（比如 tags: 2024）时退回纯文本，别让整行凭空消失
  if (cell.childElementCount === 0) cell.textContent = items.join(" ");
}

export class FrontmatterWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  eq(other: FrontmatterWidget) {
    return other.source === this.source;
  }
  get estimatedHeight() {
    return this.source.split("\n").length * 22;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-fm";
    for (const [key, value] of Object.entries(parseFrontmatter(this.source)?.data ?? {})) {
      const row = document.createElement("div");
      row.className = "cm-lp-fm-row";
      const name = document.createElement("span");
      name.className = "cm-lp-fm-key";
      name.textContent = key;
      const cell = document.createElement("span");
      cell.className = "cm-lp-fm-val";
      if (key.toLowerCase() === "tags") fillTags(cell, value);
      else cell.textContent = Array.isArray(value) ? value.join("、") : value;
      row.append(name, cell);
      wrap.appendChild(row);
    }

    wrap.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const tag = (e.target as Element).closest?.("[data-lp-tag]")?.getAttribute("data-lp-tag");
      e.preventDefault();
      e.stopPropagation(); // 事件到不了编辑器根节点，标签不会被再派一次
      if (tag) {
        requestOpenTag(tag);
        return;
      }
      // 点卡片空处＝有意编辑：光标送到第二行（严格落在区间内部才会还原源码）
      view.dispatch({ selection: { anchor: view.posAtDOM(wrap) + 4 }, scrollIntoView: true });
      view.focus();
    });
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}
