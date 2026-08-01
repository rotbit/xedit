// 批注锚点：把选区定位为「渲染后正文纯文本」上的 [start, end) 区间。
// 存 选中文本 + 24 字前文 + 第几次出现：正文小改后优先按 前文+原文 重新对位，
// 找不到再退到第 N 次出现，仍找不到视为失效（原文已被修改）。
// 高亮用真实 <span> 包裹文本片段（可跨加粗/链接等行内元素），不改动纯文本内容，
// 因此多条批注可以按同一份纯文本偏移依次包裹，互不影响。

export interface AnchorInput {
  anchorText: string;
  anchorPrefix: string;
  anchorIndex: number;
}

export interface AnchorRange {
  start: number;
  end: number;
}

/** 节点边界在 root 纯文本中的偏移 */
function offsetIn(root: HTMLElement, container: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(container, offset);
  return r.toString().length;
}

/** 从当前选区构造锚点；选区不在 root 内 / 为空 / 过长时返回 null */
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

/** 在当前正文中重新定位锚点；正文已改到找不到时返回 null（批注失效） */
export function locateAnchor(root: HTMLElement, a: AnchorInput): AnchorRange | null {
  if (!a.anchorText) return null;
  const full = root.textContent ?? "";
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

/** 把 [start, end) 区间的文本片段逐个包进高亮 span（data-anno=批注 id） */
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
    if (!target.data.trim()) continue; // 段落间的纯空白不高亮
    const span = document.createElement("span");
    span.className = "xe-anno";
    span.dataset.anno = annoId;
    target.parentNode?.insertBefore(span, target);
    span.appendChild(target);
  }
}

/** 摘掉所有高亮 span（保留文本），并合并相邻文本节点恢复干净结构 */
export function clearHighlights(root: HTMLElement): void {
  for (const span of Array.from(root.querySelectorAll("span.xe-anno"))) {
    const parent = span.parentNode;
    if (!parent) continue;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  }
  root.normalize();
}
