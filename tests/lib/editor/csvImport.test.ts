import { describe, expect, it, vi } from "vitest";

// @codemirror/view reads document.documentElement.style on load (same shim as the livePreview tests)
vi.hoisted(() => {
  const doc = (globalThis as { document?: { documentElement?: unknown } }).document;
  if (doc && !doc.documentElement) doc.documentElement = { style: {} };
});

import { EditorState } from "@codemirror/state";
import {
  isDelimitedFile,
  padTableBlock,
  parseDelimited,
  rowsToMarkdownTable,
} from "@/lib/editor/csvImport";

describe("isDelimitedFile", () => {
  it("matches by extension or mime", () => {
    expect(isDelimitedFile(new File([""], "Data.CSV"))).toBe(true);
    expect(isDelimitedFile(new File([""], "x.tsv"))).toBe(true);
    expect(isDelimitedFile(new File([""], "blob", { type: "text/csv" }))).toBe(true);
    expect(isDelimitedFile(new File([""], "a.png", { type: "image/png" }))).toBe(false);
  });
});

describe("parseDelimited", () => {
  it("strips the BOM and accepts CRLF, LF and CR", () => {
    expect(parseDelimited("﻿a,b\r\n1,2\n3,4\r5,6\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
      ["5", "6"],
    ]);
  });

  it("handles quoted fields with commas, escaped quotes and newlines", () => {
    expect(parseDelimited('name,note\n"Smith, J","say ""hi""\nthere"\n')).toEqual([
      ["name", "note"],
      ["Smith, J", 'say "hi"\nthere'],
    ]);
  });

  it("sniffs tabs", () => {
    expect(parseDelimited("a\tb, c\td\n1\t2\t3\n")).toEqual([
      ["a", "b, c", "d"],
      ["1", "2", "3"],
    ]);
  });

  it("sniffs semicolons", () => {
    expect(parseDelimited("a;b;c\n1,5;2;3\n")).toEqual([
      ["a", "b", "c"],
      ["1,5", "2", "3"],
    ]);
  });

  it("prefers comma on ties and drops trailing empty rows", () => {
    expect(parseDelimited("a,b;c\n1,2;3\n\n\n")).toEqual([
      ["a", "b;c"],
      ["1", "2;3"],
    ]);
  });
});

describe("rowsToMarkdownTable", () => {
  it("pads ragged rows and trims cells", () => {
    expect(rowsToMarkdownTable([[" a ", "b"], ["1"], ["1", "2", "3"]])).toBe(
      ["| a | b |  |", "| --- | --- | --- |", "| 1 |  |  |", "| 1 | 2 | 3 |"].join("\n")
    );
  });

  it("escapes pipes and turns newlines into <br>", () => {
    expect(rowsToMarkdownTable([["h"], ["a|b"], ["x\ny"]])).toBe(
      ["| h |", "| --- |", "| a\\|b |", "| x<br>y |"].join("\n")
    );
  });

  it("returns null for empty input or an empty header", () => {
    expect(rowsToMarkdownTable(parseDelimited(""))).toBeNull();
    expect(rowsToMarkdownTable([])).toBeNull();
    expect(rowsToMarkdownTable([["", " "], ["1", "2"]])).toBeNull();
  });
});

describe("padTableBlock", () => {
  const T = "| a |\n| --- |";
  const pad = (doc: string, at: number) => padTableBlock(T, at, EditorState.create({ doc }));

  it("inserts on an empty document without padding before", () => {
    expect(pad("", 0)).toBe(`${T}\n`);
  });

  it("breaks out of a non-empty line with a blank line", () => {
    expect(pad("text", 4)).toBe(`\n\n${T}\n`);
  });

  it("adds a blank line after a non-empty previous line, and before following text", () => {
    expect(pad("para\nnext", 5)).toBe(`\n${T}\n\n`);
  });
});
