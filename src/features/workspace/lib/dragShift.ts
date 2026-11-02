/**
 * "Make room" geometry for drag-to-reorder lists (today's todo list and the sidebar tree).
 *
 * Instead of drawing an insertion line, the dragged item's slot stays as a gap and the rows between the
 * source and the drop point slide over by the source's height, so the gap follows the pointer.
 *
 * Markup contract:
 * - every row element carries `data-drag-row="<key>"` (the visible row that is hit-tested);
 * - the element that moves with a row (the row itself, or a folder wrapper that also holds its children)
 *   carries `data-drag-block`. The translateY goes on the block, so nested blocks move with their parent.
 *
 * Hit testing always uses the *original* geometry (current rects minus the translateY currently applied,
 * read from the computed style so a transition mid-flight is accounted for), so shifting rows never
 * changes what the pointer is over and nothing jitters. Measuring fresh on every dragover also covers
 * scrolling and folders auto-expanding mid-drag.
 */

export interface RowGeom {
  key: string;
  /** Visible row, untranslated, in client coordinates */
  rowTop: number;
  rowBottom: number;
  /** The row's block (row + nested children), untranslated */
  blockTop: number;
  blockBottom: number;
  /** Key of the row owning the enclosing block, or null at top level */
  parentKey: string | null;
  rowEl?: Element;
  blockEl?: Element;
}

export interface DragGap {
  key: string;
  place: "before" | "after";
}

export type Shifts = Map<string, number>;

/** Transition applied to blocks only while a drag is in progress; without it rows snap back instantly after a drop */
export const SHIFT_TRANSITION = "transition-transform duration-150 ease-out";

/** translateY of a computed `transform` value ("none", matrix(...) or matrix3d(...)) */
export function translateYOf(transform: string): number {
  const m = /^matrix(3d)?\(([^)]*)\)$/.exec(transform.trim());
  if (!m) return 0;
  const v = m[2].split(",").map((s) => parseFloat(s));
  const ty = m[1] ? v[13] : v[5];
  return Number.isFinite(ty) ? ty : 0;
}

/** Measure all `[data-drag-row]` rows inside container (document order) with the current translations removed */
export function measureRows(container: HTMLElement): RowGeom[] {
  const out: RowGeom[] = [];
  const keyOfBlock = new Map<Element, string>();
  const tyCache = new Map<Element, number>();
  const tyOf = (el: Element) => {
    let ty = tyCache.get(el);
    if (ty === undefined) {
      ty = translateYOf(getComputedStyle(el).transform);
      tyCache.set(el, ty);
    }
    return ty;
  };
  /** Next enclosing block strictly above el, staying inside container */
  const blockAbove = (el: Element): Element | null => {
    const b = el.parentElement?.closest("[data-drag-block]") ?? null;
    return b && container.contains(b) && b !== container ? b : null;
  };

  for (const rowEl of Array.from(container.querySelectorAll("[data-drag-row]"))) {
    const key = rowEl.getAttribute("data-drag-row");
    if (!key) continue;
    const own = rowEl.closest("[data-drag-block]");
    const blockEl = own && container.contains(own) && own !== container ? own : rowEl;
    // Sum of every translation applied to this row through its block chain
    let ty = 0;
    for (let b: Element | null = own === blockEl ? blockEl : null; b; b = blockAbove(b)) ty += tyOf(b);
    const r = rowEl.getBoundingClientRect();
    const br = blockEl.getBoundingClientRect();
    const parentBlock = blockAbove(blockEl);
    keyOfBlock.set(blockEl, key);
    out.push({
      key,
      rowTop: r.top - ty,
      rowBottom: r.bottom - ty,
      blockTop: br.top - ty,
      blockBottom: br.bottom - ty,
      parentKey: parentBlock ? (keyOfBlock.get(parentBlock) ?? null) : null,
      rowEl,
      blockEl,
    });
  }
  return out;
}

/** Tolerance for pointers in the thin gaps between rows (e.g. the sidebar's 2px row gap) so the target doesn't flicker */
const HIT_SLOP = 4;

/** Row whose original rect contains clientY; within HIT_SLOP of a row edge counts as that row. null = no row */
export function hitRow(rows: RowGeom[], clientY: number): RowGeom | null {
  let best: RowGeom | null = null;
  let bestDist = HIT_SLOP + 0.001;
  for (const r of rows) {
    if (clientY >= r.rowTop && clientY < r.rowBottom) return r;
    const d = clientY < r.rowTop ? r.rowTop - clientY : clientY - r.rowBottom;
    if (d < bestDist) {
      best = r;
      bestDist = d;
    }
  }
  return best;
}

/** Upper half of a row = before it, lower half = after it (original geometry) */
export function placeIn(row: RowGeom, clientY: number): "before" | "after" {
  return clientY < (row.rowTop + row.rowBottom) / 2 ? "before" : "after";
}

const zeros = (rows: RowGeom[]): Shifts => new Map(rows.map((r) => [r.key, 0]));

/**
 * Per-row translateY (relative to the enclosing block, ready to put on each block) that opens a gap at `gap`.
 * - With the source among rows: rows between the source and the gap slide by the source block's height (+ the spacing
 *   to the next row), and the source block moves into the gap.
 * - Source not among rows (dragged in from elsewhere, or hidden in a collapsed folder): rows from the gap down slide
 *   down by the target row's height to make room.
 * `after K` means after K's whole block (after a folder = after its subtree). gap null / inside the source = all 0.
 */
export function computeShifts(rows: RowGeom[], sourceKey: string | null, gap: DragGap | null): Shifts {
  const target = gap ? rows.find((r) => r.key === gap.key) : undefined;
  if (!gap || !target) return zeros(rows);
  const src = sourceKey === null ? undefined : rows.find((r) => r.key === sourceKey);
  const inSrc = (r: RowGeom) => !!src && r.rowTop >= src.blockTop && r.rowTop < src.blockBottom;
  if (inSrc(target)) return zeros(rows);

  // Row spacing around the source: to the next row below it, or (when it's last) from the row above it
  const srcSpacing = () => {
    if (!src) return 0;
    const next = rows.find((r) => !inSrc(r) && r.rowTop >= src.blockBottom - 0.5);
    if (next) return Math.max(0, next.blockTop - src.blockBottom);
    const above = rows.filter((r) => r.rowBottom <= src.blockTop + 0.5).map((r) => r.rowBottom);
    return above.length ? Math.max(0, src.blockTop - Math.max(...above)) : 0;
  };
  const spacing = srcSpacing();

  let gapY: number;
  if (gap.place === "before") {
    gapY = target.rowTop;
  } else {
    // "After K" = before whatever follows K's block, so it lines up exactly with "before next"
    const next = rows.find((r) => !inSrc(r) && r.rowTop >= target.blockBottom - 0.5);
    gapY = next ? next.rowTop : target.blockBottom + spacing;
  }

  const abs = new Map<string, number>();
  if (!src) {
    const shift = target.rowBottom - target.rowTop;
    for (const r of rows) abs.set(r.key, r.rowTop >= gapY - 0.5 ? shift : 0);
  } else {
    const shift = src.blockBottom - src.blockTop + spacing;
    const down = gapY > src.blockTop;
    for (const r of rows) {
      let dy = 0;
      if (inSrc(r)) dy = down ? gapY - shift - src.blockTop : gapY - src.blockTop;
      else if (down && r.rowTop >= src.blockBottom - 0.5 && r.rowTop < gapY - 0.5) dy = -shift;
      else if (!down && r.rowTop >= gapY - 0.5 && r.rowTop < src.blockTop - 0.5) dy = shift;
      abs.set(r.key, dy);
    }
  }

  // Blocks are nested: a child already moves with its parent's block, so output only the difference
  const out: Shifts = new Map();
  for (const r of rows) {
    const own = abs.get(r.key) ?? 0;
    const parent = r.parentKey === null ? 0 : (abs.get(r.parentKey) ?? 0);
    out.set(r.key, own - parent);
  }
  return out;
}

/** Shallow equality for two shift maps, to skip redundant state updates on every dragover */
export function sameShifts(a: Shifts, b: Shifts): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

/** Inline style for a block given its shift (none when 0, so idle rows get no stacking context) */
export function shiftTransform(dy: number | undefined): { transform?: string } {
  return dy ? { transform: `translateY(${dy}px)` } : {};
}
