import { syntaxTree } from "@codemirror/language";
import {
  RangeSet,
  StateEffect,
  type EditorState,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { isVideoUrl, posterFromTitle } from "@/lib/media";

/**
 * 即时渲染（类 Obsidian Live Preview）——节点级还原策略：
 * 隐藏语法标记、行内渲染图片/引用/任务清单，但还原粒度是「语法节点」而非「整行」，
 * 保证光标的被动移动（上下键路过、点击定位）不引起正文位移：
 * - 行内标记（**、`、~~、链接）：光标进入该语法范围内才显示标记，位移只发生在焦点处
 * - 行首标记（#、>）：永远可见但淡化缩小，任何光标移动都零位移
 * - 图片/分割线：atomicRanges 让光标只停在两侧，路过不还原；点击部件才展开源码
 */

class ImageWidget extends WidgetType {
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

class VideoWidget extends WidgetType {
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
class CodeLangWidget extends WidgetType {
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

class HrWidget extends WidgetType {
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

class BulletWidget extends WidgetType {
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

class CheckboxWidget extends WidgetType {
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

/** 光标位置集合（仅空选区）：节点级还原的判定依据 */
function caretPositions(state: EditorState): number[] {
  return state.selection.ranges.filter((r) => r.empty).map((r) => r.head);
}

function hasTextSelection(state: EditorState) {
  return state.selection.ranges.some((range) => !range.empty);
}

/** 光标落在 [from, to]（含边界）内 —— 行内语法的还原判定 */
function caretTouches(caret: number[], from: number, to: number) {
  return caret.some((p) => p >= from && p <= to);
}

/** 光标严格位于 (from, to) 内部 —— 图片/分割线的还原判定。
    边界不算：上下键路过时光标只会停在边界（atomicRanges 保证），不触发还原 */
function caretInside(caret: number[], from: number, to: number) {
  return caret.some((p) => p > from && p < to);
}

interface Built {
  decorations: DecorationSet;
  /** 图片/分割线的替换范围：光标移动按整体跳过，不落入内部 */
  atomics: DecorationSet;
}

function buildDecorations(view: EditorView, caret: number[]): Built {
  const { state } = view;
  const decos: Range<Decoration>[] = [];
  const atomics: Range<Decoration>[] = [];
  const hide = (from: number, to: number) => {
    if (from < to) decos.push(Decoration.replace({}).range(from, to));
  };
  /** 行首标记（#、>）连同其后空格淡化缩小：永远占位，光标经过零位移 */
  const faintMark = (from: number, to: number) => {
    const end = state.sliceDoc(to, to + 1) === " " ? to + 1 : to;
    if (from < end) decos.push(Decoration.mark({ class: "cm-lp-mark" }).range(from, end));
  };
  const eachLine = (from: number, to: number, cls: (n: number, first: number, last: number) => string) => {
    const first = state.doc.lineAt(from).number;
    const last = state.doc.lineAt(to).number;
    for (let n = first; n <= last; n++) {
      decos.push(Decoration.line({ class: cls(n, first, last) }).range(state.doc.line(n).from));
    }
  };

  for (const range of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        const { name } = node;

        if (/^ATXHeading[1-6]$/.test(name)) {
          // 标题行级样式（宋体、层级字号、块级呼吸空间）——静态类，不随光标变化
          const level = Math.min(4, Number(name.slice(-1)));
          decos.push(
            Decoration.line({ class: `cm-lp-h${level}` }).range(state.doc.lineAt(node.from).from)
          );
          const mark = node.node.getChild("HeaderMark");
          if (mark) faintMark(mark.from, mark.to);
          return;
        }
        if (name === "SetextHeading1" || name === "SetextHeading2") {
          decos.push(
            Decoration.line({ class: name === "SetextHeading1" ? "cm-lp-h1" : "cm-lp-h2" }).range(
              state.doc.lineAt(node.from).from
            )
          );
          for (const m of node.node.getChildren("HeaderMark")) faintMark(m.from, m.to);
          return;
        }
        if (name === "Emphasis" || name === "StrongEmphasis") {
          if (!caretTouches(caret, node.from, node.to))
            for (const m of node.node.getChildren("EmphasisMark")) hide(m.from, m.to);
          return;
        }
        if (name === "InlineCode") {
          if (!caretTouches(caret, node.from, node.to)) {
            const marks = node.node.getChildren("CodeMark");
            for (const m of marks) hide(m.from, m.to);
            // 内容打上胶囊样式（内衬 + 圆角），只作用于行内代码，不波及代码块
            if (marks.length >= 2 && marks[1].from > marks[0].to) {
              decos.push(
                Decoration.mark({ class: "cm-lp-ic" }).range(marks[0].to, marks[1].from)
              );
            }
          }
          return;
        }
        if (name === "Strikethrough") {
          if (!caretTouches(caret, node.from, node.to))
            for (const m of node.node.getChildren("StrikethroughMark")) hide(m.from, m.to);
          return;
        }
        if (name === "Link") {
          if (!caretTouches(caret, node.from, node.to)) {
            const n = node.node;
            const marks = n.getChildren("LinkMark");
            const url = n.getChild("URL");
            const title = n.getChild("LinkTitle");
            for (const m of marks) hide(m.from, m.to);
            if (url) hide(url.from, url.to);
            if (title) hide(title.from, title.to);
            // 链接文字提示 URL，点击直接打开（⌥+点击进入源码编辑）
            const href = url ? state.sliceDoc(url.from, url.to) : "";
            if (href && marks.length >= 2 && marks[1].from > marks[0].to) {
              decos.push(
                Decoration.mark({
                  class: "cm-lp-link",
                  attributes: { "data-lp-href": href, title: `${href}\n点击打开 · ⌥+点击编辑` },
                }).range(marks[0].to, marks[1].from)
              );
            }
          }
          return;
        }
        if (name === "URL") {
          // 裸链接 / 自动链接：Link、Image 里的 URL 已由整体处理，这里只管独立出现的
          const parent = node.node.parent?.name;
          if (parent === "Link" || parent === "Image") return;
          if (caretTouches(caret, node.from, node.to)) return; // 编辑中不拦点击
          const raw = state.sliceDoc(node.from, node.to);
          const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
          decos.push(
            Decoration.mark({
              class: "cm-lp-link",
              attributes: { "data-lp-href": href, title: "点击打开 · ⌥+点击编辑" },
            }).range(node.from, node.to)
          );
          return;
        }
        if (name === "Image") {
          if (!caretInside(caret, node.from, node.to)) {
            const n = node.node;
            const url = n.getChild("URL");
            const marks = n.getChildren("LinkMark");
            const src = url ? state.sliceDoc(url.from, url.to) : "";
            const alt = marks.length >= 2 ? state.sliceDoc(marks[0].to, marks[1].from) : "";
            if (src) {
              // 视频复用图片语法，title 位携带 poster= 封面约定
              const titleNode = n.getChild("LinkTitle");
              const rawTitle = titleNode
                ? state.sliceDoc(titleNode.from, titleNode.to).replace(/^["'(]|["')]$/g, "")
                : "";
              const widget = isVideoUrl(src)
                ? new VideoWidget(src, alt, posterFromTitle(rawTitle))
                : new ImageWidget(src, alt);
              const deco = Decoration.replace({ widget }).range(node.from, node.to);
              decos.push(deco);
              atomics.push(deco);
            }
          }
          return false; // 内部标记已整体处理
        }
        if (name === "HorizontalRule") {
          if (!caretInside(caret, node.from, node.to)) {
            const deco = Decoration.replace({ widget: new HrWidget() }).range(node.from, node.to);
            decos.push(deco);
            atomics.push(deco);
          }
          return;
        }
        if (name === "Blockquote") {
          eachLine(node.from, node.to, () => "cm-lp-quote");
          return;
        }
        if (name === "QuoteMark") {
          faintMark(node.from, node.to);
          return;
        }
        if (name === "FencedCode") {
          eachLine(node.from, node.to, (n, first, last) =>
            n === first
              ? "cm-lp-code cm-lp-code-first"
              : n === last
                ? "cm-lp-code cm-lp-code-last"
                : "cm-lp-code"
          );
          // 开栏行换语言下拉、闭栏行隐藏：光标落到该行才还原 ``` 源码
          const marks = node.node.getChildren("CodeMark");
          const info = node.node.getChild("CodeInfo");
          const firstLine = state.doc.lineAt(node.from);
          if (marks.length > 0 && !caretTouches(caret, firstLine.from, firstLine.to)) {
            const lang = info ? state.sliceDoc(info.from, info.to).trim() : "";
            const deco = Decoration.replace({
              widget: new CodeLangWidget(lang, marks[0].to, firstLine.to),
            }).range(firstLine.from, firstLine.to);
            decos.push(deco);
            atomics.push(deco);
          }
          if (marks.length >= 2) {
            const lastLine = state.doc.lineAt(marks[marks.length - 1].from);
            if (
              lastLine.number !== firstLine.number &&
              lastLine.from < lastLine.to &&
              !caretTouches(caret, lastLine.from, lastLine.to)
            ) {
              const deco = Decoration.replace({}).range(lastLine.from, lastLine.to);
              decos.push(deco);
              atomics.push(deco);
            }
          }
          return;
        }
        if (name === "ListMark") {
          if (caretTouches(caret, node.from, node.to)) return;
          if (node.node.parent?.parent?.name !== "BulletList") return; // 有序列表数字保留
          if (/^ \[[ xX]\]/.test(state.sliceDoc(node.to, node.to + 4))) {
            hide(node.from, node.to + 1); // 任务项只留 checkbox
          } else {
            decos.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
          }
          return;
        }
        if (name === "TaskMarker") {
          if (!caretTouches(caret, node.from, node.to)) {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to));
            decos.push(
              Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to)
            );
          }
          return;
        }
      },
    });
  }
  return {
    decorations: Decoration.set(decos, true),
    atomics: Decoration.set(atomics, true),
  };
}

/** 用轻量 effect 触发一次装饰重算（鼠标点击结束并收回为单光标时使用）。 */
const refreshLivePreview = StateEffect.define<null>();

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomics: DecorationSet;
    private caret: number[];
    private selectingWithMouse = false;
    private removeMouseListeners: (() => void) | null = null;

    constructor(view: EditorView) {
      this.caret = caretPositions(view.state);
      const built = buildDecorations(view, this.caret);
      this.decorations = built.decorations;
      this.atomics = built.atomics;
    }

    update(update: ViewUpdate) {
      const forced = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(refreshLivePreview))
      );

      // 文档变化会让旧位置失效；单光标移动则切换需要还原源码的语法节点。
      if (
        update.docChanged ||
        (update.selectionSet && !this.selectingWithMouse && !hasTextSelection(update.state))
      ) {
        this.caret = caretPositions(update.state);
      }

      // 鼠标拖选和非空选区调整期间不因 selectionSet 重建装饰。
      // viewport 变化仍按冻结的光标位置补齐新进入视口的装饰。
      const selectionNeedsRebuild =
        update.selectionSet && !this.selectingWithMouse && !hasTextSelection(update.state);
      if (update.docChanged || update.viewportChanged || selectionNeedsRebuild || forced) {
        const built = buildDecorations(update.view, this.caret);
        this.decorations = built.decorations;
        this.atomics = built.atomics;
      }
    }

    beginMouseSelection(view: EditorView) {
      if (this.selectingWithMouse) return;
      const win = view.dom.ownerDocument.defaultView;
      if (!win) return;

      this.selectingWithMouse = true;
      const finish = () => this.finishMouseSelection(view);
      win.addEventListener("mouseup", finish, true);
      win.addEventListener("blur", finish, true);
      this.removeMouseListeners = () => {
        win.removeEventListener("mouseup", finish, true);
        win.removeEventListener("blur", finish, true);
      };
    }

    private finishMouseSelection(view: EditorView) {
      if (!this.selectingWithMouse) return;
      this.selectingWithMouse = false;
      this.removeMouseListeners?.();
      this.removeMouseListeners = null;

      // 单击定位光标后再按节点还原；真正的拖选沿用按下前的稳定布局。
      if (!hasTextSelection(view.state)) {
        this.caret = caretPositions(view.state);
        view.dispatch({ effects: refreshLivePreview.of(null) });
      }
    }

    destroy() {
      this.removeMouseListeners?.();
      this.removeMouseListeners = null;
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(event, view) {
        const target = event.target as Element | null;
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          target?.closest?.(".cm-lp-checkbox")
        ) {
          return;
        }
        this.beginMouseSelection(view);
      },
    },
  }
);

export const livePreview: Extension = [
  livePreviewPlugin,
  // 图片/分割线按整体跳过：上下键路过时光标停在两侧边界，部件不还原、不跳动
  EditorView.atomicRanges.of((view) => view.plugin(livePreviewPlugin)?.atomics ?? RangeSet.empty),
  EditorView.editorAttributes.of({ class: "cm-live-preview" }),
  EditorView.domEventHandlers({
    mousedown: (e) => {
      // 链接点击即打开；⌥+点击放行给 CodeMirror 定位光标（还原源码可编辑）
      if (e.button !== 0 || e.altKey) return false;
      const el = (e.target as HTMLElement).closest?.("[data-lp-href]");
      const href = el?.getAttribute("data-lp-href");
      if (href) {
        window.open(href, "_blank", "noopener");
        e.preventDefault();
        return true;
      }
      return false;
    },
  }),
];
