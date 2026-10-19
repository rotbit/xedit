/**
 * Paired symbols: auto-insert the closing half, wrap selected text in one keystroke, and delete both on backspace.
 *
 * Not using closeBrackets from @codemirror/autocomplete: although it's in node_modules (pulled in
 * indirectly by lang-markdown), it isn't listed in package.json dependencies, so importing it directly means
 * betting on the package manager's hoisting; and the rules Chinese writing needs (full-width pairs like 「」《》, non-bracket
 * wrapping marks like `*` `~`, no pairing for apostrophes) would all fight its config, so a custom inputHandler is actually shorter.
 */

import {
  EditorSelection,
  MapMode,
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { caretInFencedCode } from "@/lib/livePreview/context";

/** Paired symbols that auto-insert the closing half. The full-width pairs are the truly frequent ones in Chinese text; half-width brackets are rarer */
const PAIRS: Readonly<Record<string, string>> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
  "`": "`",
  "（": "）", // i18n-ignore
  "「": "」", // i18n-ignore
  "『": "』", // i18n-ignore
  "《": "》", // i18n-ignore
  "【": "】", // i18n-ignore
  "“": "”",
  "‘": "’",
};

/** Act as wrappers only when there's a selection: a single `*` means a multiplication sign or a literal asterisk, and auto-completing to `**` just gets in the way */
const WRAP_ONLY = new Set(["*", "_", "~", "$", "="]);

/** Only insert the closing half when the next char is one of these (or line end): pairing right against text would wrap the following word in brackets */
const CLOSE_BEFORE = /[\s)\]}>）】」』》”’,.;:!?，。；：！？、]/u;

/** A word-final apostrophe is part of the word (don't, it's); turning it into don''t is the most annoying kind of "smart" */
const WORD_END = /[\p{L}\p{N}]$/u;

function pairFor(ch: string): readonly [string, string] | null {
  const close = PAIRS[ch];
  if (close) return [ch, close];
  return WRAP_ONLY.has(ch) ? [ch, ch] : null;
}

/** Brackets and quotes in code are syntax, not punctuation (regexes, strings, array indices), so stay out of it */
function inCode(state: EditorState, pos: number): boolean {
  if (caretInFencedCode(state)) return true;
  for (const side of [-1, 1] as const) {
    for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side); n; n = n.parent) {
      if (n.name === "InlineCode" || n.name === "CodeText" || n.name === "CodeBlock") return true;
    }
  }
  return false;
}

/** Position of the closing half just auto-inserted */
const markAutoClose = StateEffect.define<number>();
/** The user typed the closing half and skipped over it: this position no longer gets "skip-over" treatment */
const dropAutoClose = StateEffect.define<number>();

/**
 * Position table of auto-inserted closing halves.
 *
 * Only registered ones may be "typed over"; otherwise in `f(a|)` typing another `)` to get
 * `f(a))` would be impossible. Positions map through doc changes: assoc=1 lets inserts at the cursor push it right,
 * and TrackAfter drops it when its own character is deleted.
 */
const autoClosed = StateField.define<readonly number[]>({
  create: () => [],
  update(value, tr) {
    let next = value;
    if (tr.docChanged) {
      const mapped: number[] = [];
      for (const pos of value) {
        const m = tr.changes.mapPos(pos, 1, MapMode.TrackAfter);
        if (m !== null) mapped.push(m);
      }
      next = mapped;
    }
    for (const e of tr.effects) {
      if (e.is(markAutoClose)) next = [...next, e.value];
      else if (e.is(dropAutoClose)) next = next.filter((p) => p !== e.value);
    }
    return next;
  },
});

/** Typing `(` or `*` with text selected means "wrap this", not "replace it with this character" */
function wrapSelectionWith(view: EditorView, open: string, close: string): boolean {
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) =>
      range.empty
        ? { range }
        : {
            changes: [
              { from: range.from, insert: open },
              { from: range.to, insert: close },
            ],
            // Keep the selection on the content: typing `*` twice gives **bold**, and adding brackets on top is easy too
            range: EditorSelection.range(range.from + open.length, range.to + open.length),
          }
    ),
    { userEvent: "input.type", scrollIntoView: true }
  );
  return true;
}

function handleInput(view: EditorView, from: number, to: number, text: string): boolean {
  // During IME composition this is called per character; inserting a closing half would push away the candidate box and get mangled by the subsequent whole-range replace
  if (view.composing || view.compositionStarted) return false;
  if (text.length !== 1) return false;
  const { state } = view;
  const main = state.selection.main;
  // Only handle "the user typing on the main selection": programmatic inserts, drags, etc. take the default path
  if (main.from !== from || main.to !== to) return false;

  // Try "skip-over" first, and it must come before the pair-table lookup: closing halves like `)` `》` aren't "openers" themselves,
  // so the lookup would just miss and return; same-character quotes and backticks must check this first too, or they'd keep inserting new pairs in place
  if (
    main.empty &&
    state.sliceDoc(main.head, main.head + 1) === text &&
    state.field(autoClosed).includes(main.head)
  ) {
    view.dispatch({
      selection: { anchor: main.head + 1 },
      effects: dropAutoClose.of(main.head),
      scrollIntoView: true,
    });
    return true;
  }

  const pair = pairFor(text);
  if (!pair) return false;
  const [open, close] = pair;

  if (!main.empty) {
    // `*` `~` are Markdown marks, meaningless for wrapping text in code; brackets and quotes can wrap anywhere
    if (WRAP_ONLY.has(text) && inCode(state, main.head)) return false;
    return wrapSelectionWith(view, open, close);
  }

  const pos = main.head;
  if (!PAIRS[text] || inCode(state, pos)) return false;
  const before = pos > state.doc.lineAt(pos).from ? state.sliceDoc(pos - 1, pos) : "";
  if (WORD_END.test(before) && (text === "'" || text === '"' || text === "`")) return false;
  const after = state.sliceDoc(pos, pos + 1);
  if (after && !CLOSE_BEFORE.test(after)) return false;

  view.dispatch({
    changes: { from: pos, insert: open + close },
    selection: { anchor: pos + open.length },
    effects: markAutoClose.of(pos + open.length),
    userEvent: "input.type",
    scrollIntoView: true,
  });
  return true;
}

/** Backspace inside an empty pair: delete both halves so a lone closing bracket isn't left behind */
function deleteEmptyPair(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty || range.head === 0) return false;
  const before = state.sliceDoc(range.head - 1, range.head);
  if (!PAIRS[before] || PAIRS[before] !== state.sliceDoc(range.head, range.head + 1)) return false;
  // No pairing or deleting in code blocks: Delete inside fences belongs to livePreview/fenceKeys, don't take over its job
  if (inCode(state, range.head)) return false;
  view.dispatch({
    changes: { from: range.head - 1, to: range.head + 1 },
    userEvent: "delete.backward",
    scrollIntoView: true,
  });
  return true;
}

/** Backspace uses Prec.highest to run before markdownKeymap's deleteMarkupBackward;
 *  returns false immediately when not between a pair, leaving fence/list deletion untouched */
export const autoPairs: Extension = [
  autoClosed,
  EditorView.inputHandler.of(handleInput),
  Prec.highest(keymap.of([{ key: "Backspace", run: deleteEmptyPair }])),
];
