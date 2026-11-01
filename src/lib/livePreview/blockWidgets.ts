import { EditorView, WidgetType } from "@codemirror/view";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { texToSvg } from "@/lib/markdown/mathjax";
import { mathJaxReady, refreshWhenMathReady } from "@/lib/livePreview/mathReady";
import { editOnClick } from "@/lib/livePreview/widgetUtils";

/** Block-level live-render widget for $$ math (the table widget lives in tableWidget.ts). Multi-line replacement can only
 *  come from a state field; decoration building is in blocks.ts. All HTML written to the DOM goes through DOMPurify first (sanitizeHtml) */

/** Estimated height of a math block: 10px vertical padding each side (.cm-lp-math), plus a typical one-line formula SVG height */
const MATH_BLOCK_HEIGHT = 64;

/** MathJax loads asynchronously: on first render it's usually not ready, so show the source as a placeholder; once ready
 *  refreshLivePreview triggers a rebuild (readiness and refresh are in mathReady.ts, shared with inline math).
 *  ready is part of eq, otherwise the widget would be "equal" and keep the stale DOM */
export class MathBlockWidget extends WidgetType {
  private readonly ready = mathJaxReady();
  constructor(readonly tex: string) {
    super();
  }
  eq(other: MathBlockWidget) {
    return other.tex === this.tex && other.ready === this.ready;
  }
  get estimatedHeight() {
    return MATH_BLOCK_HEIGHT;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-math";
    if (!this.ready) {
      const holder = document.createElement("span");
      holder.className = "cm-lp-math-loading";
      holder.textContent = this.tex;
      wrap.appendChild(holder);
      refreshWhenMathReady(view);
    } else {
      try {
        // texToSvg produces MathJax's own SVG; still sanitize it through the shared pipeline before it enters the DOM
        wrap.innerHTML = sanitizeHtml(texToSvg(this.tex, true));
      } catch {
        wrap.classList.add("cm-lp-math-error");
        wrap.textContent = this.tex;
      }
    }
    // +2 skips the leading `$$`: a cursor inside the range restores the source
    editOnClick(wrap, view, 2);
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}
