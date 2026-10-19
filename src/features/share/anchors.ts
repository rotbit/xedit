// Annotation anchors: locate a selection as a [start, end) range over the rendered body's plain text.
// We store selected text + 24 chars of preceding context + occurrence index: after small body edits, re-align by context + text first,
// then fall back to the Nth occurrence; if still not found, the anchor is stale (the original was edited).
// Highlights wrap text fragments in real <span>s (can span inline elements like bold/links) without changing the plain text,
// so multiple annotations can be wrapped in turn against the same plain-text offsets without interfering.

export interface AnchorInput {
  anchorText: string;
  anchorPrefix: string;
  anchorIndex: number;
}

export interface AnchorRange {
  start: number;
  end: number;
}

/** Offset of a node boundary within root's plain text */
function offsetIn(root: HTMLElement, container: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(container, offset);
  return r.toString().length;
}

/** Build an anchor from the current selection; returns null if the selection is outside root / empty / too long */
export function anchorFromSelection(
  root: HTMLElement,
  sel: Selection
): (AnchorInput & AnchorRange) | null {
  if (sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;
  if (!root.contains(range.commonAncestorContainer)) return null;
  const text = range.toString();
  if (!text.trim() || text.length > 1000) return null;

  const start = offsetIn(root, range.startContainer, range.startOffset);
  const full = root.textContent ?? "";
  const prefix = full.slice(Math.max(0, start - 24), start);
  let index = 0;
  let pos = full.indexOf(text);
  while (pos !== -1 && pos < start) {
    index++;
    pos = full.indexOf(text, pos + 1);
  }
  return { anchorText: text, anchorPrefix: prefix, anchorIndex: index, start, end: start + text.length };
}

/**
 * Re-locate an anchor in the current body; returns null when the body has changed beyond recognition (annotation stale).
 * full = the body's full plain text, computed once by the caller: laying out highlights locates each one,
 * and reading root.textContent per annotation would be O(annotations × body length), painful for long articles with a dozen annotations.
 */
export function locateAnchor(full: string, a: AnchorInput): AnchorRange | null {
  if (!a.anchorText) return null;
  if (a.anchorPrefix) {
    const i = full.indexOf(a.anchorPrefix + a.anchorText);
    if (i !== -1) {
      const start = i + a.anchorPrefix.length;
      return { start, end: start + a.anchorText.length };
    }
  }
  let pos = -1;
  for (let n = 0; n <= a.anchorIndex; n++) {
    pos = full.indexOf(a.anchorText, pos + 1);
    if (pos === -1) break;
  }
  if (pos === -1) pos = full.indexOf(a.anchorText);
  if (pos === -1) return null;
  return { start: pos, end: pos + a.anchorText.length };
}

/** Wrap each text fragment in [start, end) in a highlight span (data-anno = annotation id) */
export function highlightRange(
  root: HTMLElement,
  { start, end }: AnchorRange,
  annoId: string
): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: { node: Text; s: number; e: number }[] = [];
  let offset = 0;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const nodeStart = offset;
    const nodeEnd = offset + n.data.length;
    offset = nodeEnd;
    const s = Math.max(start, nodeStart);
    const e = Math.min(end, nodeEnd);
    if (s < e) targets.push({ node: n, s: s - nodeStart, e: e - nodeStart });
    if (nodeEnd >= end) break;
  }
  for (const { node, s, e } of targets) {
    let target = node;
    if (s > 0) target = node.splitText(s);
    if (e - s < target.data.length) target.splitText(e - s);
    if (!target.data.trim()) continue; // Don't highlight pure whitespace between paragraphs
    const span = document.createElement("span");
    span.className = "xe-anno";
    span.dataset.anno = annoId;
    target.parentNode?.insertBefore(span, target);
    span.appendChild(target);
  }
}

/** Remove all highlights (text spans and media outlines) and merge adjacent text nodes to restore a clean structure */
export function clearHighlights(root: HTMLElement): void {
  for (const span of Array.from(root.querySelectorAll("span.xe-anno"))) {
    const parent = span.parentNode;
    if (!parent) continue;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(".xe-anno-media"))) {
    el.classList.remove("xe-anno-media", "xe-anno-active");
    el.removeAttribute("data-anno");
  }
  root.normalize();
}

// —— Media (image/video) anchors: src + index among same-src elements ——

/** Whether an element can be the target of a media annotation */
export function isMediaTarget(el: Element): el is HTMLElement {
  return el.tagName === "IMG" || el.tagName === "VIDEO";
}

function mediaSrc(el: Element): string {
  return el.getAttribute("src") ?? "";
}

/** Build an anchor for a media element (anchorText = src, anchorIndex = which occurrence of that src) */
export function mediaAnchor(root: HTMLElement, el: Element): AnchorInput {
  const src = mediaSrc(el);
  const all = Array.from(root.querySelectorAll("img, video")).filter((m) => mediaSrc(m) === src);
  return { anchorText: src, anchorPrefix: "", anchorIndex: Math.max(0, all.indexOf(el)) };
}

/** Find the media element for an anchor in the current body; returns null if the src no longer exists (annotation stale) */
export function locateMedia(root: HTMLElement, a: AnchorInput): HTMLElement | null {
  const all = Array.from(root.querySelectorAll<HTMLElement>("img, video")).filter(
    (m) => mediaSrc(m) === a.anchorText
  );
  return all[a.anchorIndex] ?? all[0] ?? null;
}

/** Attach the highlight outline and annotation id to a media element (one media can carry several, data-anno is space-separated) */
export function markMedia(el: HTMLElement, annoId: string): void {
  el.classList.add("xe-anno-media");
  const prev = el.dataset.anno;
  el.dataset.anno = prev ? `${prev} ${annoId}` : annoId;
}

/** Plain-text offset before an element, used to sort annotations by position (media and text anchors share one ruler) */
export function textOffsetBefore(root: HTMLElement, el: Element): number {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEndBefore(el);
  return r.toString().length;
}
