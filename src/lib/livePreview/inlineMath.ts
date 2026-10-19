import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { texToSvg } from "@/lib/markdown/mathjax";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { caretTouches, type LpContext } from "@/lib/livePreview/context";
import { mathJaxReady, refreshWhenMathReady } from "@/lib/livePreview/mathReady";
import { editOnClick } from "@/lib/livePreview/widgetUtils";
import type { ScanGuards, ScanLine } from "@/lib/livePreview/lineScan";
import { t } from "@/i18n/t";

/**
 * Live rendering of inline math `$…$`.
 *
 * Recognition rules are copied point by point from mathInline in markdown/math.ts (the rule export and preview use):
 * recognized in the editor but not on export is the hardest kind of "but I saw it render" bug. Alignment details are in scanLine.
 *
 * Rendering reuses block math's async readiness mechanism (mathReady.ts): while MathJax isn't loaded the source stays as-is,
 * and once loaded a refreshLivePreview rebuilds decorations — inline math has no "loading" placeholder,
 * since the source already occupies its place in the line; swapping in a fixed-width placeholder would just make the line jump first.
 */

/** Render result cache: every decoration rebuild walks the math in the visible range, and the same TeX shouldn't rerun MathJax.
    Failures are cached too (null) — reparsing a malformed formula on every keystroke is pure waste */
const svgCache = new Map<string, string | null>();
const SVG_CACHE_MAX = 200;

/** Render one inline TeX; returns null on parse failure (the caller keeps the source with an error style instead of throwing).
    The SVG goes through the same sanitizing pipeline (DOMPurify) as block math before it may enter the DOM */
function renderInlineTex(tex: string): string | null {
  const hit = svgCache.get(tex);
  if (hit !== undefined) return hit;
  let svg: string | null = null;
  try {
    svg = sanitizeHtml(texToSvg(tex, false));
  } catch {
    svg = null;
  }
  // When full, dump the whole cache (same idea as the cache in markdown/mathjax.ts): long docs never have enough math to need LRU,
  // and clearing only costs one recompute next round
  if (svgCache.size >= SVG_CACHE_MAX) svgCache.clear();
  svgCache.set(tex, svg);
  return svg;
}

/** Mount the sanitized SVG into the widget. Uses DOMParser rather than innerHTML: the content has passed DOMPurify,
    but the widget DOM is a ready-made template, and one fewer HTML assignment means one fewer place to get copied somewhere unsanitized.
    The parser doesn't execute scripts, and the cost is similar to innerHTML (one parse either way) */
function setSvg(el: HTMLElement, html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  el.append(...Array.from(parsed.body.childNodes));
}

/** Light background under the source when the cursor is in the math; the error style is the source with a red squiggly underline */
const SRC_MARK = Decoration.mark({ class: "cm-lp-math-src" });
const BAD_MARK = Decoration.mark({ class: "cm-lp-math-src cm-lp-math-bad" });

class InlineMathWidget extends WidgetType {
  constructor(readonly tex: string) {
    super();
  }
  /** Compare TeX source only: the same formula reuses its existing DOM on decoration rebuild, no need to lay out the SVG again.
      Unlike block math, readiness isn't part of the comparison — when not ready, no widget is produced here at all */
  eq(other: InlineMathWidget) {
    return other.tex === this.tex;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = "cm-lp-imath";
    el.title = t("点击编辑公式");
    // Before building the widget we already confirmed it renders (see inlineMathLine), so a sanitized SVG is guaranteed here
    setSvg(el, renderInlineTex(this.tex) ?? "");
    // +1 skips the leading `$`: a cursor inside the range makes the decoration yield to source
    editOnClick(el, view, 1);
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

/** Whether the char at index i is backslash-escaped (an odd number of consecutive backslashes before it) */
function isEscaped(text: string, i: number): boolean {
  let n = 0;
  while (i - n - 1 >= 0 && text[i - n - 1] === "\\") n++;
  return n % 2 === 1;
}

export interface InlineMathRange {
  from: number;
  to: number;
  tex: string;
}

/**
 * Scan `$…$` in one line, with coordinates converted to document offsets. Each rule maps one-to-one to mathInline in markdown/math.ts:
 * - `\$` isn't a delimiter (there the escape rule consumes it first; here we count backslashes ourselves);
 * - no closing `$`: this `$` is a plain character, and scanning continues from the next position;
 * - adjacent `$$`: empty math doesn't count, skip both chars (so `$$…$$` on one line isn't split into two inline formulas);
 * - content starting/ending with whitespace, or a closing `$` immediately followed by a digit: treated as plain characters —
 *   prices like 「$5 和 $10」 are excluded precisely by these two rules, so both sides must behave identically;
 * - delimiters inside code/links/images/tables/$$ blocks don't count (the two guard tiers are in lineScan.ts).
 *
 * Only one difference from markdown-it remains: its inline parsing spans the whole paragraph, so multi-line math like `$a\nb$` works there,
 * while we scan per line and don't recognize it — in the editor multi-line math stays as source while export still renders it, which is the safe direction.
 */
function scanLine(line: ScanLine, guards: ScanGuards): InlineMathRange[] {
  const out: InlineMathRange[] = [];
  const { text } = line;
  let pos = 0;
  while (pos < text.length) {
    const open = text.indexOf("$", pos);
    if (open < 0) break;
    const openAt = line.from + open;
    if (
      isEscaped(text, open) ||
      guards.inBlock(openAt, openAt + 1) ||
      guards.inInline(openAt, openAt + 1)
    ) {
      pos = open + 1;
      continue;
    }
    // Look ahead for an unescaped closing `$`
    let close = -1;
    for (let i = open + 1; i < text.length; i++) {
      const hit = text.indexOf("$", i);
      if (hit < 0) break;
      if (!isEscaped(text, hit)) {
        close = hit;
        break;
      }
      i = hit;
    }
    if (close < 0) break;
    if (close === open + 1) {
      pos = open + 2;
      continue;
    }
    const closeAt = line.from + close;
    const tex = text.slice(open + 1, close);
    if (
      /^\s/.test(tex) ||
      /\s$/.test(tex) ||
      /^\d/.test(text.slice(close + 1)) ||
      guards.inBlock(closeAt, closeAt + 1) ||
      guards.inInline(closeAt, closeAt + 1)
    ) {
      pos = open + 1;
      continue;
    }
    out.push({ from: openAt, to: closeAt + 1, tex });
    pos = close + 1;
  }
  return out;
}

/**
 * Inline math decorations for one line. Three forms:
 * - cursor touching (boundaries included, same tier as images/dividers): show source with a light background marking it as math;
 * - TeX fails to parse: also keep the source, with a red squiggly underline — never swallow content because of a malformed formula;
 * - otherwise: the whole `$…$` is replaced by MathJax's inline SVG.
 */
export function inlineMathLine(
  ctx: LpContext,
  view: EditorView,
  line: ScanLine,
  guards: ScanGuards
): void {
  for (const math of scanLine(line, guards)) {
    const { from, to } = math;
    if (caretTouches(ctx.caret, from, to)) {
      ctx.decos.push(SRC_MARK.range(from, to));
    } else if (!mathJaxReady()) {
      // Not loaded yet: keep the source as-is; once ready, refreshLivePreview reruns this round
      refreshWhenMathReady(view);
    } else {
      const svg = renderInlineTex(math.tex);
      if (svg) ctx.replaceAtomic(from, to, new InlineMathWidget(math.tex));
      else ctx.decos.push(BAD_MARK.range(from, to));
    }
    // Registration must come after decoration: ctx's replacing decorations avoid registered math ranges, so registering first would block ourselves.
    // Register whether it's a widget or source right now — `*` and `[` inside math are part of the TeX,
    // and the later syntax tree pass must not hide them as Markdown markers (see context.ts)
    ctx.mathRanges.push({ from, to });
  }
}
