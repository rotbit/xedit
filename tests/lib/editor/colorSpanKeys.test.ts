import { describe, expect, it, vi } from "vitest";

// @codemirror/view reads document.documentElement.style on load (same shim as the livePreview tests)
vi.hoisted(() => {
  const doc = (globalThis as { document?: { documentElement?: unknown } }).document;
  if (doc && !doc.documentElement) doc.documentElement = { style: {} };
});

import { markdown } from "@codemirror/lang-markdown";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { keymap, type EditorView } from "@codemirror/view";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { colorSpanKeys } from "@/lib/editor/colorSpanKeys";

const OPEN = '<span style="color:#e11d48">';

/**
 * No DOM in node, so stand in for EditorView with the three things the commands touch: state, dispatch and the composing flags.
 * `|` in the doc marks the cursor
 */
function viewAt(docWithCaret: string): EditorView {
  const head = docWithCaret.indexOf("|");
  const doc = docWithCaret.replace("|", "");
  let state = EditorState.create({ doc, selection: { anchor: head }, extensions: [markdown(), colorSpanKeys] });
  ensureSyntaxTree(state, doc.length, 1e9);
  const view = {
    get state() {
      return state;
    },
    dispatch(...specs: TransactionSpec[]) {
      state = state.update(...specs).state;
      ensureSyntaxTree(state, state.doc.length, 1e9);
    },
    composing: false,
    compositionStarted: false,
  };
  return view as unknown as EditorView;
}

/** Press Enter the way the keymap stack does: our binding first, then the default newline when it returns false */
function pressEnter(view: EditorView): string {
  const binding = view.state
    .facet(keymap)
    .flat()
    .find((b) => b.key === "Enter");
  if (!binding?.run) throw new Error("Enter binding not installed");
  if (!binding.run(view)) insertNewlineAndIndent(view);
  const { doc, selection } = view.state;
  return doc.sliceString(0, selection.main.head) + "|" + doc.sliceString(selection.main.head);
}

describe("Enter inside a color span (live preview)", () => {
  it("at the end of colored text breaks the line after the closing tag", () => {
    expect(pressEnter(viewAt(`${OPEN}红字|</span>`))).toBe(`${OPEN}红字</span>\n|`);
  });

  it("at the start of colored text breaks the line before the opening tag", () => {
    expect(pressEnter(viewAt(`前面 ${OPEN}|红字</span>`))).toBe(`前面 \n|${OPEN}红字</span>`);
  });

  it("in the middle closes the span and reopens it on the new line", () => {
    expect(pressEnter(viewAt(`${OPEN}红|字</span> 后面`))).toBe(`${OPEN}红</span>\n${OPEN}|字</span> 后面`);
  });

  it("between back-to-back spans just breaks the line", () => {
    expect(pressEnter(viewAt(`${OPEN}a</span>|${OPEN}b</span>`))).toBe(`${OPEN}a</span>\n|${OPEN}b</span>`);
  });

  it("outside any span is left to the default", () => {
    expect(pressEnter(viewAt("普通|文字"))).toBe("普通\n|文字");
  });
});
