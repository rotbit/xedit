import { EditorView, WidgetType } from "@codemirror/view";
import { deleteFencedBlock, fencedCodeAt } from "@/lib/livePreviewFenceKeys";

/** 即时渲染用到的替换部件（图片/视频/代码语言下拉/分割线/列表点/复选框），
 *  装饰构建逻辑见 livePreview.ts */

export class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = "cm-lp-image";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt || "图片";
    img.title = "点击编辑图片地址";
    // 加载失败时收起破图标，换成占位签（点击同样可编辑）
    img.addEventListener("error", () => wrap.classList.add("cm-lp-broken"));
    const fallback = document.createElement("span");
    fallback.className = "cm-lp-image-fallback";
    fallback.textContent = this.alt ? `${this.alt}（图片未加载）` : "图片未加载";
    wrap.appendChild(img);
    wrap.appendChild(fallback);
    // 点击图片＝有意编辑：把光标放进语法内部，仅此刻还原为源码
    wrap.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = view.posAtDOM(wrap);
      view.dispatch({ selection: { anchor: pos + 2 }, scrollIntoView: true });
      view.focus();
    });
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

export class VideoWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string, readonly poster: string | null) {
    super();
  }
  eq(other: VideoWidget) {
    return other.src === this.src && other.alt === this.alt && other.poster === this.poster;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = "cm-lp-video";
    const video = document.createElement("video");
    video.src = this.src;
    if (this.poster) video.poster = this.poster;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    // 播放条把点击都吃掉了，编辑入口放在下方说明栏
    const bar = document.createElement("span");
    bar.className = "cm-lp-video-bar";
    bar.textContent = this.alt ? `▶ ${this.alt}` : "▶ 视频";
    bar.title = "点击编辑视频源码";
    bar.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = view.posAtDOM(wrap);
      view.dispatch({ selection: { anchor: pos + 2 }, scrollIntoView: true });
      view.focus();
    });
    wrap.appendChild(video);
    wrap.appendChild(bar);
    return wrap;
  }
  ignoreEvent() {
    // 交给原生 <video> 控件处理播放/进度等交互
    return true;
  }
}

/** 语言下拉的候选（与飞书导入/导出常见语言对齐）；当前值不在列表时临时并入 */
const FENCE_LANGS = [
  "", "bash", "c", "cpp", "csharp", "css", "diff", "dockerfile", "go", "graphql",
  "html", "java", "javascript", "json", "kotlin", "markdown", "php", "python",
  "ruby", "rust", "scss", "shell", "sql", "swift", "toml", "typescript", "xml", "yaml",
];

const SVG_NS = "http://www.w3.org/2000/svg";
/** lucide trash-2 的路径（部件是纯 DOM，用不了 React 图标，只能自己搭一棵 SVG） */
const TRASH_PATHS = [
  "M3 6h18",
  "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",
  "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",
  "M10 11v6",
  "M14 11v6",
];

function trashIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of TRASH_PATHS) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/**
 * 代码块开栏行（```lang）：光标不在时换成整块的标题条，选择即改写围栏语言标记。
 * 标题条里左边是语言下拉、右边是删除按钮，两者互为兄弟并各自绝对定位到块的两角；
 * 外层容器只负责在文档里占位（也是 posAtDOM 的锚点，用来回查这是哪一块）。
 */
export class CodeLangWidget extends WidgetType {
  constructor(
    readonly lang: string,
    readonly infoFrom: number,
    readonly infoTo: number
  ) {
    super();
  }
  eq(other: CodeLangWidget) {
    return (
      other.lang === this.lang &&
      other.infoFrom === this.infoFrom &&
      other.infoTo === this.infoTo
    );
  }
  toDOM(view: EditorView) {
    const bar = document.createElement("span");
    bar.className = "cm-lp-codefence-bar";
    const wrap = document.createElement("span");
    wrap.className = "cm-lp-codefence";
    // 删除整块：围栏被渲染掉之后，光标删法再周全也不如一个明摆着的按钮
    const del = document.createElement("button");
    del.type = "button";
    del.className = "cm-lp-codefence-del";
    del.title = "删除代码块";
    del.setAttribute("aria-label", "删除代码块");
    del.appendChild(trashIcon());
    // mousedown 不能落到编辑器：否则焦点/光标先被抢走，click 时定位到的已不是这一块
    del.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const block = fencedCodeAt(view.state, view.posAtDOM(bar), 1);
      if (block) deleteFencedBlock(view, block);
      view.focus();
    });
    // 可见的是文字 + 箭头，原生 select 透明铺满整个标签：点标签任何位置都能打开菜单，
    // 否则 select 只有文字那么宽，点到箭头或留白就落进编辑器、光标跳到围栏行，标签当场变回源码
    const label = document.createElement("span");
    label.className = "cm-lp-codefence-label";
    label.textContent = this.lang || "纯文本";
    wrap.appendChild(label);
    const select = document.createElement("select");
    select.title = "代码语言";
    const langs = FENCE_LANGS.includes(this.lang) ? FENCE_LANGS : [this.lang, ...FENCE_LANGS];
    for (const l of langs) {
      const opt = document.createElement("option");
      opt.value = l;
      opt.textContent = l || "纯文本";
      if (l === this.lang) opt.selected = true;
      select.appendChild(opt);
    }
    // 标签整体都不能把 mousedown 漏给编辑器，否则光标先被抢走
    wrap.addEventListener("mousedown", (e) => e.stopPropagation());
    select.addEventListener("change", () => {
      view.dispatch({
        changes: { from: this.infoFrom, to: this.infoTo, insert: select.value },
      });
    });
    wrap.appendChild(select);
    // 下拉在前、删除按钮在后：CSS 用 ~ 选择器让下拉获得焦点时也把按钮点亮
    bar.appendChild(wrap);
    bar.appendChild(del);
    return bar;
  }
  ignoreEvent() {
    return true;
  }
}

export class HrWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = "cm-lp-hr";
    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = view.posAtDOM(el);
      view.dispatch({ selection: { anchor: pos + 1 }, scrollIntoView: true });
      view.focus();
    });
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

export class BulletWidget extends WidgetType {
  /** 视觉层级 1/2/3（实心点/空心圈/方点），嵌套更深时循环复用 */
  constructor(readonly level: number) {
    super();
  }
  eq(other: BulletWidget) {
    return other.level === this.level;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-lp-bullet";
    el.dataset.level = String(this.level);
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

export class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-lp-checkbox";
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(box);
      const marker = view.state.sliceDoc(pos, pos + 3);
      if (/^\[[ xX]\]$/.test(marker)) {
        view.dispatch({
          changes: { from: pos, to: pos + 3, insert: this.checked ? "[ ]" : "[x]" },
        });
      }
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}
