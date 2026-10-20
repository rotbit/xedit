import { EditorSelection, type Extension } from "@codemirror/state";
import { EditorView, RectangleMarker, layer } from "@codemirror/view";

/** Selection layer that keeps code cards tidy.
 *  drawSelection measures a multi-line selection's left/right edges from the first .cm-line's padding (body text, 28px),
 *  but code lines are indented to 44px, so the middle block spilled over the card's inner padding and border, while the first
 *  and last rows only covered glyph height and left notches against it: copying from a code block looked like a stack of
 *  misaligned blocks. Here the selection is split into runs of code / non-code lines: non-code runs are drawn exactly as
 *  CodeMirror does, code runs are clamped to the code text column and snapped to full row height.
 *  drawSelection stays for the caret and hiding the native selection; its own selection layer is hidden in editor.css. */

const CLASS = "cm-selectionBackground";

function lineElement(view: EditorView, pos: number): HTMLElement | null {
  const { node, offset } = view.domAtPos(pos);
  const target = node === view.contentDOM ? node.childNodes[offset] : node;
  const el = target?.nodeType === 1 ? (target as HTMLElement) : target?.parentElement;
  return el?.closest<HTMLElement>(".cm-line") ?? null;
}

function isCodeLine(view: EditorView, pos: number): boolean {
  return !!lineElement(view, pos)?.classList.contains("cm-lp-code");
}

function rect(left: number, top: number, right: number, bottom: number) {
  return new RectangleMarker(CLASS, left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

/** Merge vertically touching rectangles with the same horizontal extent, so rounded corners don't notch the seams */
function merge(markers: RectangleMarker[]): RectangleMarker[] {
  const out: RectangleMarker[] = [];
  for (const m of markers) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.width != null &&
      m.width != null &&
      Math.abs(prev.left - m.left) < 1 &&
      Math.abs(prev.width - m.width) < 1 &&
      Math.abs(prev.top + prev.height - m.top) < 1
    ) {
      out[out.length - 1] = rect(prev.left, prev.top, prev.left + prev.width, m.top + m.height);
    } else out.push(m);
  }
  return out;
}

function rangeMarkers(view: EditorView, from: number, to: number): RectangleMarker[] {
  const { doc } = view.state;
  const scroll = view.scrollDOM.getBoundingClientRect();
  const baseLeft = scroll.left - view.scrollDOM.scrollLeft * view.scaleX;
  const baseTop = scroll.top - view.scrollDOM.scrollTop * view.scaleY;
  const lineTop = (pos: number) => view.lineBlockAt(pos).top + view.documentTop - baseTop;

  const out: RectangleMarker[] = [];
  let line = doc.lineAt(from);
  while (line.from <= to) {
    // Collect a run of consecutive lines of the same kind
    const code = isCodeLine(view, line.from);
    const first = line;
    while (line.to < to && line.number < doc.lines && isCodeLine(view, line.to + 1) === code) line = doc.line(line.number + 1);
    const last = line;
    const segFrom = Math.max(from, first.from);
    const continues = to > last.to;
    // A non-code run that continues takes its newline too, so blank lines before a code card get filled like CodeMirror does
    const segTo = continues && !code ? last.to + 1 : Math.min(to, last.to);

    if (segFrom < segTo) {
      let pieces = RectangleMarker.forRange(view, CLASS, EditorSelection.range(segFrom, segTo));
      if (!code) {
        if (continues) {
          // Drop the sliver forRange paints on the next line's first row, and keep the fill above that line
          const limit = lineTop(last.to + 1);
          pieces = pieces
            .filter((m) => m.top < limit - 0.5)
            .map((m) => (m.top + m.height > limit ? rect(m.left, m.top, m.left + (m.width ?? 0), limit) : m));
        }
        out.push(...pieces);
      } else {
        const startEl = lineElement(view, segFrom);
        const endEl = lineElement(view, segTo);
        if (startEl && endEl && pieces.length) {
          const box = startEl.getBoundingClientRect();
          const style = getComputedStyle(startEl);
          const left = box.left + parseFloat(style.paddingLeft) - baseLeft;
          const right = box.right - parseFloat(style.paddingRight) - baseLeft;
          // Glyph boxes sit centred in the row: grow the first/last rows by the half-leading to fill the whole row
          const halfLeading = (el: HTMLElement, h: number) => (parseFloat(getComputedStyle(el).lineHeight) - h) / 2;
          const n = pieces.length - 1;
          const growTop = halfLeading(startEl, pieces[0].height);
          const growBottom = halfLeading(endEl, pieces[n].height);
          pieces = pieces.map((m, i) =>
            rect(
              Math.max(m.left, left),
              i === 0 ? m.top - growTop : m.top,
              i === n && continues ? right : Math.min(m.left + (m.width ?? 0), right),
              i === n ? m.top + m.height + growBottom : m.top + m.height,
            ),
          );
          out.push(...merge(pieces.filter((m) => (m.width ?? 0) > 0)));
        }
      }
    }
    if (last.number >= doc.lines) break;
    line = doc.line(last.number + 1);
  }
  return out;
}

const codeAwareSelectionLayer = layer({
  above: false,
  markers(view) {
    const markers: RectangleMarker[] = [];
    for (const r of view.state.selection.ranges) {
      if (r.empty) continue;
      const from = Math.max(r.from, view.viewport.from);
      const to = Math.min(r.to, view.viewport.to);
      if (from < to) markers.push(...rangeMarkers(view, from, to));
    }
    return markers;
  },
  update(update) {
    return update.docChanged || update.selectionSet || update.viewportChanged;
  },
  mount(dom) {
    dom.classList.add("cm-selectionLayer");
  },
  class: "cm-xe-selectionLayer",
});

export const codeAwareSelection: Extension = codeAwareSelectionLayer;
