import { describe, expect, it, vi } from "vitest";

// 同 livePreview 那几个用例：@codemirror/view 加载时要读 document.documentElement.style
vi.hoisted(() => {
  const doc = (globalThis as { document?: { documentElement?: unknown } }).document;
  if (doc && !doc.documentElement) doc.documentElement = { style: {} };
});

import { EditorState } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import {
  markClass,
  REVIEW_ID_ATTR,
  reviewMarkCss,
  reviewMarksField,
  setReviewMarks,
  type ReviewMark,
} from "@/features/review/editorMarks";

/**
 * 正文里的标注。这里不要 DOM：StateField 是纯状态，拿一个 EditorState 就能驱动，
 * 要验的三件事也都发生在状态层——喂得进去、跟着文档变化挪位置、撤得干净。
 */

const DOC = "第一行写了一句话\n第二行也写了一句话";

function state(doc = DOC) {
  return EditorState.create({ doc, extensions: [reviewMarksField] });
}

/** 把装饰摊平成好断言的数组 */
function marks(set: DecorationSet) {
  const out: { from: number; to: number; cls: string; id: string | undefined }[] = [];
  set.between(0, Number.MAX_SAFE_INTEGER, (from, to, value) => {
    const spec = value.spec as {
      class?: string;
      attributes?: Record<string, string>;
    };
    out.push({ from, to, cls: spec.class ?? "", id: spec.attributes?.[REVIEW_ID_ATTR] });
  });
  return out;
}

const mk = (over: Partial<ReviewMark> = {}): ReviewMark => ({
  from: 0,
  to: 3,
  id: "rv1",
  categoryId: "verbose",
  active: false,
  ...over,
});

describe("reviewMarksField", () => {
  it("一开始什么都不画", () => {
    expect(state().field(reviewMarksField).size).toBe(0);
  });

  it("effect 喂进来的区间就是画出来的区间，类名与 id 都挂上了", () => {
    const next = state().update({
      effects: setReviewMarks.of([mk(), mk({ from: 9, to: 12, id: "rv2", categoryId: "语病!" })]),
    }).state;
    const got = marks(next.field(reviewMarksField));
    expect(got).toHaveLength(2);
    expect(got[0]).toMatchObject({ from: 0, to: 3, id: "rv1" });
    expect(got[0].cls).toContain("cm-review-mark");
    expect(got[0].cls).toContain(markClass("verbose"));
    expect(got[0].cls).not.toContain("cm-review-active");
    // 分类 id 未必是合法的 CSS 标识符，拼类名前要洗一遍
    expect(got[1].cls).toContain("cm-review-cat-__");
  });

  it("选中的那条多一个 active 类（样式在 editor.css 里）", () => {
    const next = state().update({ effects: setReviewMarks.of([mk({ active: true })]) }).state;
    expect(marks(next.field(reviewMarksField))[0].cls).toContain("cm-review-active");
  });

  it("空区间不画：from === to 画不出东西，还会把 RangeSet 搞乱", () => {
    const next = state().update({ effects: setReviewMarks.of([mk({ to: 0 })]) }).state;
    expect(next.field(reviewMarksField).size).toBe(0);
  });

  it("乱序喂进来也不炸（RangeSet 要求升序，内部自己排过）", () => {
    const next = state().update({
      effects: setReviewMarks.of([mk({ from: 9, to: 12, id: "rv2" }), mk()]),
    }).state;
    expect(marks(next.field(reviewMarksField)).map((m) => m.from)).toEqual([0, 9]);
  });

  it("文档一改，标注自己跟着挪——打字途中不会错位", () => {
    const withMarks = state().update({
      effects: setReviewMarks.of([mk({ from: 9, to: 12, id: "rv2" })]),
    }).state;
    const typed = withMarks.update({ changes: { from: 0, insert: "开头插两个字" } }).state;
    expect(marks(typed.field(reviewMarksField))[0]).toMatchObject({ from: 15, to: 18 });
  });

  it("引文被整段删掉时，那条标注跟着消失", () => {
    const withMarks = state().update({ effects: setReviewMarks.of([mk()]) }).state;
    const cut = withMarks.update({ changes: { from: 0, to: 4, insert: "" } }).state;
    expect(cut.field(reviewMarksField).size).toBe(0);
  });

  it("喂一个空数组就是全部清掉（退出审核走这条路）", () => {
    const withMarks = state().update({ effects: setReviewMarks.of([mk()]) }).state;
    expect(withMarks.field(reviewMarksField).size).toBe(1);
    const cleared = withMarks.update({ effects: setReviewMarks.of([]) }).state;
    expect(cleared.field(reviewMarksField).size).toBe(0);
  });
});

describe("reviewMarkCss", () => {
  const css = reviewMarkCss([
    { id: "verbose", label: "啰嗦", color: "#c2820a" },
    { id: "grammar", label: "语病", color: "#d93025" },
  ]);

  it("每一类都给了日间与夜间两套变量（深色压在炭黑面板上看不见）", () => {
    expect(css).toContain(`.${markClass("verbose")}{--rv-color:#c2820a;`);
    expect(css).toContain(`[data-theme="dark"] .${markClass("verbose")}{--rv-color:#`);
    expect(css).toContain(markClass("grammar"));
  });

  it("夜间那套是提亮过的，不会还是原色", () => {
    const dark = css.split("\n").find((l) => l.startsWith('[data-theme="dark"]'))!;
    expect(dark).not.toContain("#c2820a");
  });

  it("没有分类就不产出任何规则", () => {
    expect(reviewMarkCss([])).toBe("");
  });
});
