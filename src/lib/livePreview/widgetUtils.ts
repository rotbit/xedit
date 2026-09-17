import type { EditorView } from "@codemirror/view";

/** 即时渲染部件共用的小工具（点击进入编辑）。部件本体分散在 widgets.ts / blockWidgets.ts /
 *  frontmatterWidget.ts，这套行为它们一字不差地共用，所以单独放一处。 */

/**
 * 点击部件＝有意编辑：把光标送进语法内部（严格落在区间内才会还原源码）。
 *
 * - offset：跳过开头标记的字符数（`![` 是 2、`$$` 是 2、分割线是 1、表格行首的 `|` 是 1……），
 *   落在区间内部装饰才会让位给源码（图片/视频改成含边界判定后落点不再是还原的前提，
 *   但仍按 2 送进 alt 里：接着打字改的就是图片说明，而不是把 `!` 撞掉）
 * - anchor：posAtDOM 的锚点，默认就是挂监听的元素。视频部件的播放条把点击都吃掉了，
 *   编辑入口只能挂在下方说明栏上，位置却要按外层容器回查，两者因此可以不是同一个元素
 * - 表格单元格另带 data-source-offset：点哪一格就落到那一格，优先于 offset
 */
export function editOnClick(
  el: HTMLElement,
  view: EditorView,
  offset: number,
  anchor: HTMLElement = el
) {
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = view.posAtDOM(anchor);
    const cell = (e.target as Element).closest<HTMLElement>("[data-source-offset]");
    const target = cell ? Number(cell.dataset.sourceOffset) : offset;
    view.dispatch({ selection: { anchor: pos + target }, scrollIntoView: true });
    view.focus();
  });
}
