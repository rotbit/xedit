import { EditorView, WidgetType } from "@codemirror/view";

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

/** 代码块开栏行（```lang）：光标不在时换成语言下拉，选择即改写围栏语言标记 */
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
    const wrap = document.createElement("span");
    wrap.className = "cm-lp-codefence";
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
    // 原生 select 会按最长选项撑宽：改成按当前值的实际宽度收紧（等宽字体下 ch 精确，中文按 2ch）
    const label = this.lang || "纯文本";
    const units = [...label].reduce((n, ch) => n + (ch.charCodeAt(0) > 127 ? 2 : 1), 0);
    select.style.width = `${units + 1}ch`;
    select.addEventListener("mousedown", (e) => e.stopPropagation());
    select.addEventListener("change", () => {
      view.dispatch({
        changes: { from: this.infoFrom, to: this.infoTo, insert: select.value },
      });
    });
    wrap.appendChild(select);
    return wrap;
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
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-lp-bullet";
    el.textContent = "•";
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
