import { EditorView, WidgetType } from "@codemirror/view";
import { deleteFencedBlock, fencedCodeAt } from "@/lib/livePreview/fenceKeys";
import { editOnClick } from "@/lib/livePreview/widgetUtils";
import { t } from "@/i18n/t";

/** Replacement widgets used by live rendering (images/video/code language dropdown/dividers/list bullets/checkboxes);
 *  decoration building is in livePreview/index.ts */

/**
 * The image widget has two forms (same for video), chosen by preview:
 * - preview=false: the rendered form replacing the whole `![](…)` source; clicking enters editing;
 * - preview=true: the preview attached below the source while editing it. The source is showing as-is then,
 *   and clicking the preview would only drag the cursor back after `![`, so no editOnClick — just swallow mousedown to keep focus.
 * The form is part of eq: the two forms have different DOM, so switching must rebuild the widget.
 */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly preview = false
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt && other.preview === this.preview;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = this.preview ? "cm-lp-image cm-lp-media-below" : "cm-lp-image";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt || t("图片");
    if (!this.preview) img.title = t("点击编辑图片地址");
    // On load failure, hide the broken-image icon and show a placeholder label instead (also clickable to edit)
    img.addEventListener("error", () => wrap.classList.add("cm-lp-broken"));
    const fallback = document.createElement("span");
    fallback.className = "cm-lp-image-fallback";
    fallback.textContent = this.alt ? t("{alt}（图片未加载）", { alt: this.alt }) : t("图片未加载");
    wrap.appendChild(img);
    wrap.appendChild(fallback);
    if (this.preview) {
      // The widget is a contenteditable=false foreign node; clicking it moves the browser's DOM selection inside,
      // making the editor lose focus or drop the cursor next to the widget; preventDefault makes it as if nothing was clicked
      wrap.addEventListener("mousedown", (e) => e.preventDefault());
    } else {
      // Clicking the image = intentional edit: put the cursor inside the syntax (after `![`), reverting to source only now
      editOnClick(wrap, view, 2);
    }
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

export class VideoWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly poster: string | null,
    readonly preview = false
  ) {
    super();
  }
  eq(other: VideoWidget) {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.poster === this.poster &&
      other.preview === this.preview
    );
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = this.preview ? "cm-lp-video cm-lp-media-below" : "cm-lp-video";
    const video = document.createElement("video");
    video.src = this.src;
    if (this.poster) video.poster = this.poster;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    wrap.appendChild(video);
    if (this.preview) {
      // Play/progress controls need native events to work, so only swallow clicks on the container's empty space (to prevent blur)
      wrap.addEventListener("mousedown", (e) => {
        if (e.target !== video) e.preventDefault();
      });
      return wrap;
    }
    // The play bar swallows all clicks, so the edit entry point is in the caption bar below
    const bar = document.createElement("span");
    bar.className = "cm-lp-video-bar";
    bar.textContent = this.alt ? `▶ ${this.alt}` : t("▶ 视频");
    bar.title = t("点击编辑视频源码");
    // The listener is on the caption bar, with the position looked up via the outer container (the play bar swallows clicks itself)
    editOnClick(bar, view, 2, wrap);
    wrap.appendChild(bar);
    return wrap;
  }
  ignoreEvent() {
    // Let the native <video> controls handle playback/progress interactions
    return true;
  }
}

/** Language dropdown options (aligned with languages common in Feishu import/export); the current value is merged in temporarily if not listed */
const FENCE_LANGS = [
  "", "bash", "c", "cpp", "csharp", "css", "diff", "dockerfile", "go", "graphql",
  "html", "java", "javascript", "json", "kotlin", "markdown", "php", "python",
  "ruby", "rust", "scss", "shell", "sql", "swift", "toml", "typescript", "xml", "yaml",
];

const SVG_NS = "http://www.w3.org/2000/svg";
/** Path of lucide trash-2 (the widget is plain DOM, so React icons aren't available; we build the SVG ourselves) */
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
 * Code block opening fence (```lang): when the cursor isn't there it becomes the block's header bar; selecting rewrites the fence language tag.
 * The header has the language dropdown on the left and a delete button on the right, siblings each absolutely positioned to the block's corners;
 * the outer container just holds the place in the document (and anchors posAtDOM to find which block this is).
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
    // Delete the whole block: once the fences are rendered away, no cursor-based delete logic beats an obvious button
    const del = document.createElement("button");
    del.type = "button";
    del.className = "cm-lp-codefence-del";
    del.title = t("删除代码块");
    del.setAttribute("aria-label", t("删除代码块"));
    del.appendChild(trashIcon());
    // mousedown mustn't reach the editor: otherwise focus/cursor get taken first, and by click time the position no longer points at this block
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
    // What's visible is text + arrow, with a transparent native select covering the whole label: clicking anywhere on the label opens the menu;
    // otherwise the select is only as wide as the text, and clicking the arrow or padding falls into the editor, jumps the cursor to the fence line, and the label turns back into source
    const label = document.createElement("span");
    label.className = "cm-lp-codefence-label";
    label.textContent = this.lang || t("纯文本");
    wrap.appendChild(label);
    const select = document.createElement("select");
    select.title = t("代码语言");
    const langs = FENCE_LANGS.includes(this.lang) ? FENCE_LANGS : [this.lang, ...FENCE_LANGS];
    for (const l of langs) {
      const opt = document.createElement("option");
      opt.value = l;
      opt.textContent = l || t("纯文本");
      if (l === this.lang) opt.selected = true;
      select.appendChild(opt);
    }
    // No part of the label may leak mousedown to the editor, or the cursor gets taken first
    wrap.addEventListener("mousedown", (e) => e.stopPropagation());
    select.addEventListener("change", () => {
      view.dispatch({
        changes: { from: this.infoFrom, to: this.infoTo, insert: select.value },
      });
    });
    wrap.appendChild(select);
    // Dropdown first, delete button after: CSS uses the ~ selector to also highlight the button when the dropdown is focused
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
    editOnClick(el, view, 1);
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

export class BulletWidget extends WidgetType {
  /** Visual levels 1/2/3 (filled dot/hollow circle/square), cycled for deeper nesting */
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

/**
 * The `[!tip]` marker on a callout's first line: replaced with a type badge (「提示」 (Tip), 「注意」 (Note)…).
 * It carries just one generic class; the color comes down via CSS variables from the line's cm-lp-callout-<type> —
 * the badge doesn't need to know its own type, so changing the type doesn't rebuild the widget.
 */
export class CalloutBadgeWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(other: CalloutBadgeWidget) {
    return other.label === this.label;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-lp-callout-badge";
    el.textContent = this.label;
    return el;
  }
  ignoreEvent() {
    // Clicking should put the cursor back at the marker to change the type; let CodeMirror handle positioning
    return false;
  }
}
