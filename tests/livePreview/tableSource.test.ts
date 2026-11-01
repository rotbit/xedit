import { describe, expect, it, vi } from "vitest";

// Same as eachLine.test.ts: @codemirror/view reads document.documentElement.style on load
vi.hoisted(() => {
  const doc = (globalThis as { document?: { documentElement?: unknown } }).document;
  if (doc && !doc.documentElement) doc.documentElement = { style: {} };
});

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { livePreviewBlocks, renderedTableRanges } from "@/lib/livePreview/blocks";
import { showTableSource, tableAt } from "@/lib/livePreview/tableSource";

/** Tables stay rendered while the caret is inside them; only the explicit source request reveals the pipes. */

const DOC = ["前文", "", "| a | b |", "| --- | --- |", "| 1 | 2 |", "", "后文"].join("\n");
const TABLE_FROM = DOC.indexOf("| a");

function makeState(anchor = 0): EditorState {
  let state = EditorState.create({ doc: DOC, selection: { anchor }, extensions: [markdown({ base: markdownLanguage }), livePreviewBlocks] });
  ensureSyntaxTree(state, state.doc.length, 5_000);
  state = state.update({}).state;
  return state;
}

const rendered = (state: EditorState) => renderedTableRanges(state).length === 1;

describe("table source mode", () => {
  it("光标在表格里仍渲染为组件", () => {
    let state = makeState();
    expect(rendered(state)).toBe(true);
    state = state.update({ selection: { anchor: DOC.indexOf("1 |") } }).state;
    expect(rendered(state)).toBe(true);
    state = state.update({ selection: { anchor: TABLE_FROM } }).state;
    expect(rendered(state)).toBe(true);
  });

  it("showTableSource 之后显示源码，光标离开后回到组件", () => {
    let state = makeState();
    const table = tableAt(state, TABLE_FROM)!;
    expect(table.from).toBe(TABLE_FROM);
    state = state.update({ effects: showTableSource.of(table.from), selection: { anchor: DOC.indexOf("1 |") + 1 } }).state;
    expect(rendered(state)).toBe(false);
    // Typing inside the source keeps it open (positions are mapped through the change)
    state = state.update({ changes: { from: DOC.indexOf("1 |") + 1, insert: "0" }, selection: { anchor: DOC.indexOf("1 |") + 2 } }).state;
    expect(rendered(state)).toBe(false);
    // A drag selection inside the table doesn't close it either
    state = state.update({ selection: { anchor: TABLE_FROM + 2, head: TABLE_FROM + 4 } }).state;
    expect(rendered(state)).toBe(false);
    state = state.update({ selection: { anchor: state.doc.length } }).state;
    expect(rendered(state)).toBe(true);
    // Coming back afterwards doesn't reopen it
    state = state.update({ selection: { anchor: TABLE_FROM + 2 } }).state;
    expect(rendered(state)).toBe(true);
  });

  it("Enter 在表头行首把表格往下推，源码模式仍保持", () => {
    let state = makeState();
    state = state.update({ effects: showTableSource.of(TABLE_FROM), selection: { anchor: TABLE_FROM } }).state;
    expect(rendered(state)).toBe(false);
    state = state.update({ changes: { from: TABLE_FROM, insert: "\n" }, selection: { anchor: TABLE_FROM + 1 } }).state;
    expect(rendered(state)).toBe(false);
  });
});
