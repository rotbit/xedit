/**
 * 正文里的审核标注：一个装在编辑器里的 CodeMirror 扩展。
 *
 * 为什么标注要长在编辑器里而不是渲染面上：作者审稿时人就坐在编辑区，意见得画在他正在改的
 * 那几个字上；画在另一栏的成品里，看得见改不着，还得两边对着找。
 *
 * 装法：StateField 存一套 Decoration.mark，靠 StateEffect 从外面（React 那侧）喂进来。
 * 文档一改，RangeSet 自己把位置映射过去，于是打字途中标注不会错位；下一轮重新对位再覆盖。
 * 扩展是审核开启时用 appendConfig 动态挂上去的——平时一行代码都不进编辑器。
 */

import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { lighten, tint } from "./colors";
import type { ReviewCategory } from "./types";

/** 一处标注：位置 + 它是哪条意见、哪一类、是不是当前选中的那条 */
export interface ReviewMark {
  from: number;
  to: number;
  id: string;
  categoryId: string;
  active: boolean;
}

/** 点击落在标注上时，从 DOM 上读回意见 id 用的属性名 */
export const REVIEW_ID_ATTR = "data-review-id";

/** 分类 id 是「服务端」给的，未必是合法的 CSS 标识符，洗一遍再拼类名 */
export function markClass(categoryId: string): string {
  return `cm-review-cat-${categoryId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** 换一整套标注（传空数组就是全部清掉） */
export const setReviewMarks = StateEffect.define<readonly ReviewMark[]>();

function build(marks: readonly ReviewMark[]): DecorationSet {
  const ranges = marks
    .filter((m) => m.to > m.from)
    .slice()
    // RangeSet 要求按起点升序喂进来；同起点的让长的排前面，短的叠在上层
    .sort((a, b) => a.from - b.from || b.to - a.to)
    .map((m) =>
      Decoration.mark({
        class: `cm-review-mark ${markClass(m.categoryId)}${m.active ? " cm-review-active" : ""}`,
        attributes: { [REVIEW_ID_ATTR]: m.id },
      }).range(m.from, m.to)
    );
  return Decoration.set(ranges, true);
}

export const reviewMarksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    // 先跟着文档变化挪位置，再看这次事务有没有带来新的一套
    let next = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setReviewMarks)) next = build(effect.value);
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * 几何变化的信号：卡片要贴着自己那句话的高度站，行高一变位置就得重算。
 * docChanged 只是其中一种——折行、视口推进（远处的行从估算高度换成实测）同样会挪动一切。
 */
function geometrySignal(onGeometry: () => void): Extension {
  return EditorView.updateListener.of((update) => {
    if (update.geometryChanged || update.viewportChanged || update.docChanged) onGeometry();
  });
}

/**
 * 把标注扩展挂进一个已经跑起来的编辑器（审核开启时调用一次）。
 *
 * appendConfig 挂上去就摘不下来了，所以：
 * - 重复挂要拦住（切文档会重建编辑器，那是另一个 view，自然要再挂一次）；
 * - onGeometry 里得自己判断审核还开着没有，退出审核后别再叫醒 React。
 */
export function installReviewMarks(view: EditorView, onGeometry: () => void): void {
  if (view.state.field(reviewMarksField, false) !== undefined) return;
  view.dispatch({
    effects: StateEffect.appendConfig.of([reviewMarksField, geometrySignal(onGeometry)]),
  });
}

/** 换一套标注；扩展还没挂上（编辑器刚重建）时返回 false，由调用方决定要不要先挂 */
export function pushReviewMarks(view: EditorView, marks: readonly ReviewMark[]): boolean {
  if (view.state.field(reviewMarksField, false) === undefined) return false;
  view.dispatch({ effects: setReviewMarks.of(marks) });
  return true;
}

/**
 * 每一类的配色。分类是结果自己带的，所以这段 CSS 只能现生成：
 * 类名里只放 --rv-* 变量，下划线、底色的写法在 editor.css 里固定一份。
 * 夜间单独给一套——深色分类色压在炭黑面板上几乎看不见，先提亮再配底。
 */
export function reviewMarkCss(categories: readonly ReviewCategory[]): string {
  const rules: string[] = [];
  for (const c of categories) {
    const cls = markClass(c.id);
    const dark = lighten(c.color, 0.42);
    rules.push(
      `.${cls}{--rv-color:${c.color};--rv-tint:${tint(c.color, 0.1)};--rv-tint-on:${tint(c.color, 0.22)};}`,
      `[data-theme="dark"] .${cls}{--rv-color:${dark};--rv-tint:${tint(dark, 0.16)};--rv-tint-on:${tint(dark, 0.3)};}`
    );
  }
  return rules.join("\n");
}
