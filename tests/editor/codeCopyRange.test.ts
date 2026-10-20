import { describe, expect, it, vi } from "vitest";

// @codemirror/view reads document.documentElement.style at module load for browser detection,
// and the minimal document stub in node lacks it, so it must be patched in before the import
vi.hoisted(() => {
  const doc = (globalThis as { document?: { documentElement?: unknown } }).document;
  if (doc && !doc.documentElement) doc.documentElement = { style: {} };
});

import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { codeCopyRange } from "@/lib/editor/clipboard";

const DOC = "intro\n\n```yaml\nMongo:\n  Uri: x\n```\n\nafter";

function copied(from: number, to: number): string | null {
  const state = EditorState.create({ doc: DOC, extensions: [markdown()], selection: EditorSelection.range(from, to) });
  ensureSyntaxTree(state, state.doc.length, 5000);
  const r = codeCopyRange(state);
  return r ? state.sliceDoc(r.from, r.to) : null;
}

const at = (s: string) => DOC.indexOf(s);

describe("codeCopyRange: copying inside a code block drops swept fence lines", () => {
  it("drops the closing fence when a drag runs past the last code line", () => {
    expect(copied(at("Mongo"), at("```\n\nafter") + 3)).toBe("Mongo:\n  Uri: x");
  });

  it("drops the opening fence when the drag starts on the title bar", () => {
    expect(copied(at("```yaml"), at("Uri"))).toBe("Mongo:\n  ");
  });

  it("ignores blank lines swept around the card", () => {
    expect(copied(at("Mongo"), DOC.indexOf("after"))).toBe("Mongo:\n  Uri: x");
    expect(copied(at("\n\n```yaml") + 1, at(": x") + 3)).toBe("Mongo:\n  Uri: x");
  });

  it("leaves selections that don't touch the fences alone", () => {
    expect(copied(at("Mongo"), at(": x") + 3)).toBeNull();
  });

  it("drops the fences even when the whole block is swept, since they're invisible", () => {
    expect(copied(at("```yaml"), at("```\n\nafter") + 3)).toBe("Mongo:\n  Uri: x");
    expect(copied(at("\n\n```yaml") + 1, at("```\n\nafter") + 4)).toBe("Mongo:\n  Uri: x");
  });

  it("keeps the fences when the selection reaches body text", () => {
    expect(copied(0, at("```\n\nafter") + 3)).toBeNull();
    expect(copied(at("Mongo"), DOC.length)).toBeNull();
  });
});
