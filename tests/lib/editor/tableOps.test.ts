import { describe, expect, it } from "vitest";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import {
  cellWriteBack,
  cycleAlign,
  deleteColumn,
  deleteRow,
  displayCellText,
  escapeCellText,
  insertColumn,
  insertRow,
  tableCells,
  writeCell,
} from "@/lib/editor/tableOps";

const TABLE = ["| a | b | c |", "| --- | :-: | --: |", "| 1 | 2 | 3 |", "| 4 | 5 |"].join("\n");

function setup(doc = TABLE) {
  const state = EditorState.create({ doc });
  return { state, table: { from: 0, to: doc.length } };
}

function apply(state: EditorState, spec: TransactionSpec | null): string {
  expect(spec).not.toBeNull();
  return state.update({ changes: spec!.changes }).state.doc.toString();
}

describe("tableCells", () => {
  it("按行切出单元格内容范围，分隔行带标记", () => {
    const { state, table } = setup();
    const rows = tableCells(state, table.from, table.to);
    expect(rows.map((r) => r.delimiter)).toEqual([false, true, false, false]);
    expect(rows.map((r) => r.cells.length)).toEqual([3, 3, 3, 2]);
    const [a] = rows[0].cells;
    expect(state.sliceDoc(a.from, a.to)).toBe("a");
    expect(state.sliceDoc(rows[1].cells[2].from, rows[1].cells[2].to)).toBe("--:");
  });
});

describe("cell write-back", () => {
  it("转义竖线、折叠换行、两侧各补一个空格", () => {
    expect(cellWriteBack("a|b")).toBe(" a\\|b ");
    expect(cellWriteBack("x\ny")).toBe(" x y ");
    expect(cellWriteBack("")).toBe("  ");
    // An existing escape is copied through as a pair, so the backslash doesn't eat the new escape
    expect(escapeCellText("\\|")).toBe("\\|");
    expect(escapeCellText("\\\\|")).toBe("\\\\\\|");
    expect(displayCellText("a\\|b")).toBe("a|b");
  });

  it("writeCell 只改动所在单元格，内容相同时返回 null", () => {
    const { state } = setup();
    const pos = TABLE.indexOf("2");
    expect(apply(state, writeCell(state, pos, "x|y")).split("\n")[2]).toBe("| 1 | x\\|y | 3 |");
    expect(writeCell(state, pos, " 2 ")).toBeNull();
  });
});

describe("rows", () => {
  it("在表头/分隔行后插入都落到第一条正文行之前", () => {
    const { state, table } = setup();
    const lines = apply(state, insertRow(state, table, 0)).split("\n");
    expect(lines[2]).toBe("|  |  |  |");
    expect(lines[3]).toBe("| 1 | 2 | 3 |");
  });

  it("在末行后追加空行，列数按表头", () => {
    const { state, table } = setup();
    expect(apply(state, insertRow(state, table, 3)).split("\n")[4]).toBe("|  |  |  |");
  });

  it("删除正文行；表头和分隔行拒绝", () => {
    const { state, table } = setup();
    expect(apply(state, deleteRow(state, table, 3))).toBe(TABLE.split("\n").slice(0, 3).join("\n"));
    expect(apply(state, deleteRow(state, table, 2)).split("\n")).toHaveLength(3);
    expect(deleteRow(state, table, 0)).toBeNull();
    expect(deleteRow(state, table, 1)).toBeNull();
    expect(deleteRow(state, table, 9)).toBeNull();
  });
});

describe("columns", () => {
  it("在第一列前插入", () => {
    const { state, table } = setup();
    expect(apply(state, insertColumn(state, table, -1)).split("\n")).toEqual([
      "|  | a | b | c |",
      "| --- | --- | :-: | --: |",
      "|  | 1 | 2 | 3 |",
      "|  | 4 | 5 |",
    ]);
  });

  it("在中间插入；参差行先补齐再插", () => {
    const { state, table } = setup();
    expect(apply(state, insertColumn(state, table, 2)).split("\n")).toEqual([
      "| a | b | c |  |",
      "| --- | :-: | --: | --- |",
      "| 1 | 2 | 3 |  |",
      "| 4 | 5 |  |  |",
    ]);
    expect(apply(state, insertColumn(state, table, 0)).split("\n")[3]).toBe("| 4 |  | 5 |");
  });

  it("没有首尾竖线的行也能插", () => {
    const doc = "a | b\n--- | ---\n1 | 2";
    const { state, table } = setup(doc);
    expect(apply(state, insertColumn(state, table, 1)).split("\n")).toEqual([
      "a | b|  |",
      "--- | ---| --- |",
      "1 | 2|  |",
    ]);
    expect(apply(state, insertColumn(state, table, -1)).split("\n")[0]).toBe("|  |a | b");
  });

  it("删除列，参差行缺这一列时跳过", () => {
    const { state, table } = setup();
    expect(apply(state, deleteColumn(state, table, 2)).split("\n")).toEqual([
      "| a | b |",
      "| --- | :-: |",
      "| 1 | 2 |",
      "| 4 | 5 |",
    ]);
    expect(apply(state, deleteColumn(state, table, 0)).split("\n")[3]).toBe("| 5 |");
  });

  it("只剩一列或越界时拒绝删除/插入", () => {
    const { state, table } = setup("| a |\n| --- |\n| 1 |");
    expect(deleteColumn(state, table, 0)).toBeNull();
    const full = setup();
    expect(deleteColumn(full.state, full.table, 3)).toBeNull();
    expect(insertColumn(full.state, full.table, 3)).toBeNull();
    expect(insertColumn(full.state, full.table, -2)).toBeNull();
  });
});

describe("cycleAlign", () => {
  it("无 → 左 → 中 → 右 → 无", () => {
    let { state } = setup();
    const { table } = setup();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const spec = cycleAlign(state, { from: 0, to: state.doc.length }, 0);
      state = state.update({ changes: spec!.changes }).state;
      seen.push(state.doc.line(2).text.split("|")[1].trim());
    }
    expect(seen).toEqual([":--", ":-:", "--:", "---"]);
    expect(cycleAlign(setup().state, table, 5)).toBeNull();
  });
});
