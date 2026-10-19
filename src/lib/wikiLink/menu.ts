// Article title completion when typing `[[`: trigger detection, StateField, keymap, candidate filtering.
//
// Architecture mirrors the slash menu (lib/slashMenu.ts): state lives in CodeMirror rather than React,
// keys use a Prec.highest keymap to beat defaultKeymap, and always return false to pass through when the menu is closed.
// The only difference is the candidate source — the library changes constantly, and putting it in a StateField would need another sync mechanism,
// so candidates stay out of state and getDocs() is read fresh when filtering; the StateField only stores "where it's open and what the filter is".

import { Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { caretInFencedCode } from "@/lib/livePreview/context";
import { normalizeTitle } from "@/lib/wikiLink";
import type { DocMeta } from "@/features/workspace/types";

/** List at most 8 articles at a time: more would need paging and slow down keyboard selection (the "new" item doesn't count toward the 8) */
const LIMIT = 8;

/** Candidate: an existing article, or "create a new one from the current input" */
export type WikiCandidate =
  | { kind: "doc"; title: string; doc: DocMeta }
  | { kind: "create"; title: string };

function byRecent(a: DocMeta, b: DocMeta): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

/**
 * Filter candidates: prefix matches first, then substring matches, each tier by updatedAt desc, at most 8.
 * With an empty filter, show the 8 most recently edited (just-written articles are the likeliest to be linked back).
 * With a non-empty filter and no exactly matching title, append a "new" item — linking to an article that doesn't exist yet
 * is normal in Obsidian-style writing, and nobody should be forced to create it first and come back.
 */
export function filterWikiCandidates(docs: DocMeta[], query: string): WikiCandidate[] {
  // Untitled articles can't be targeted by `[[title]]`, so listing them is useless even if selected
  const named = docs.filter((d) => d.title.trim()).sort(byRecent);
  const q = query.trim();
  const key = q.toLowerCase();
  const toItem = (doc: DocMeta): WikiCandidate => ({
    kind: "doc",
    title: doc.title.trim(),
    doc,
  });
  if (!key) return named.slice(0, LIMIT).map(toItem);

  const prefix: DocMeta[] = [];
  const contains: DocMeta[] = [];
  for (const doc of named) {
    const title = doc.title.toLowerCase();
    if (title.startsWith(key)) prefix.push(doc);
    else if (title.includes(key)) contains.push(doc);
  }
  const out = [...prefix, ...contains].slice(0, LIMIT).map(toItem);
  const exact = named.some((d) => normalizeTitle(d.title) === normalizeTitle(q));
  if (!exact) out.push({ kind: "create", title: q });
  return out;
}

export interface WikiMenuState {
  /** Position of the first `[` in `[[` */
  from: number;
  /** Filter text between `[[` and the cursor */
  query: string;
  /** Index of the highlighted item in the filtered results */
  index: number;
}

interface WikiFieldValue {
  open: WikiMenuState | null;
  /** Position of the `[[` dismissed with Esc: don't reopen automatically while the cursor is still after it */
  dismissed: number | null;
}

const EMPTY: WikiFieldValue = { open: null, dismissed: null };

/** End of the whole `[[query` range: replaced together with it by `[[title]]` on selection */
export function wikiQueryEnd(st: WikiMenuState): number {
  return st.from + 2 + st.query.length;
}

/**
 * Trigger: an unclosed `[[` before the cursor on the same line.
 * The nearest `[[` is the anchor, so the filter text never contains `[[`; three cases are excluded:
 * containing `]` (the link is already closed), containing `|` (the user is writing an alias; completion is for the target, not the alias),
 * and the cursor inside fenced code (`[[` there is array indexing and the like; a popup would just get in the way).
 */
function detectWiki(state: EditorState): { from: number; query: string } | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  if (caretInFencedCode(state)) return null;
  const line = state.doc.lineAt(sel.head);
  const before = line.text.slice(0, sel.head - line.from);
  const open = before.lastIndexOf("[[");
  if (open === -1) return null;
  const query = before.slice(open + 2);
  if (query.includes("]") || query.includes("|")) return null;
  return { from: line.from + open, query };
}

/** Close the menu. value=true means "remember this `[[`" (dismissed with Esc, don't pop back up right away) */
const closeWiki = StateEffect.define<boolean>();
/** Move the highlight: keyboard and mouse share the same index, so only the state layer can arbitrate */
const setWikiIndex = StateEffect.define<number>();

const wikiField = StateField.define<WikiFieldValue>({
  create: () => EMPTY,
  update(prev, tr) {
    // dismissed stores an absolute document offset: inserting/deleting text before it makes the position drift,
    // and without mapping, the `[[` dismissed with Esc can't be recognized (the menu would pop right back).
    // Keep the same object reference when !docChanged, so React's "no change, no re-render" holds.
    const value =
      tr.docChanged && prev.dismissed !== null
        ? { ...prev, dismissed: tr.changes.mapPos(prev.dismissed, -1) }
        : prev;
    for (const e of tr.effects) {
      if (e.is(closeWiki)) {
        return { open: null, dismissed: e.value ? (value.open?.from ?? null) : null };
      }
      if (e.is(setWikiIndex) && value.open) {
        return { ...value, open: { ...value.open, index: e.value } };
      }
    }
    // If neither doc nor cursor moved, keep the original value (same object); React uses that to skip re-rendering
    if (!tr.docChanged && !tr.selection) return value;
    const next = detectWiki(tr.state);
    // `[[` no longer before the cursor (deleted, moved away, link closed): clear the Esc memory too
    if (!next) return EMPTY;
    if (next.from === value.dismissed) return { open: null, dismissed: value.dismissed };
    // Keep the highlight only for the same `[[` with an unchanged filter; any filter change goes back to the first item
    const keep =
      value.open && value.open.from === next.from && value.open.query === next.query
        ? value.open.index
        : 0;
    return { open: { ...next, index: keep }, dismissed: null };
  },
});

export function wikiMenuStateOf(state: EditorState): WikiMenuState | null {
  return state.field(wikiField, false)?.open ?? null;
}

/**
 * Select an item: replace `[[query` with `[[title]]`, cursor after `]]`.
 * If a `]]` already follows the cursor (editors with auto-paired brackets add it in advance), consume it too,
 * otherwise we'd leave `[[title]]]]`. The "new" item inserts the same way as normal items —
 * this only writes the link; if the article still doesn't exist when clicked, useWikiLinkOpen asks whether to create it.
 */
export function pickWikiItem(
  view: EditorView,
  item: WikiCandidate,
  from: number,
  to: number
): void {
  const insert = `[[${item.title.trim()}]]`;
  const end = view.state.doc.sliceString(to, to + 2) === "]]" ? to + 2 : to;
  view.dispatch({
    changes: { from, to: end, insert },
    selection: { anchor: from + insert.length },
  });
  view.focus();
}

/** Mouse hover highlight: called from the React side so keyboard and mouse share the same index */
export function highlightWikiIndex(view: EditorView, index: number): void {
  view.dispatch({ effects: setWikiIndex.of(index) });
}

/** The index may fall outside the filtered results (library just changed); fall back to the last item */
export function activeWikiIndex(index: number, count: number): number {
  return count > 0 ? Math.min(index, count - 1) : 0;
}

function wikiKeymap(getDocs: () => DocMeta[]): Extension {
  const pickCurrent = (view: EditorView): boolean => {
    const st = wikiMenuStateOf(view.state);
    if (!st) return false;
    const items = filterWikiCandidates(getDocs(), st.query);
    // With no candidates, don't consume Enter/Tab; hand back to CodeMirror to newline or indent as usual
    const item = items[activeWikiIndex(st.index, items.length)];
    if (!item) return false;
    pickWikiItem(view, item, st.from, wikiQueryEnd(st));
    return true;
  };

  const moveHighlight = (view: EditorView, delta: number): boolean => {
    const st = wikiMenuStateOf(view.state);
    if (!st) return false;
    const n = filterWikiCandidates(getDocs(), st.query).length;
    // With no candidates there's no row to highlight; let ↑↓ through to the editor: the cursor leaves the line and the menu closes naturally
    if (!n) return false;
    highlightWikiIndex(view, (activeWikiIndex(st.index, n) + delta + n) % n);
    return true;
  };

  // Only consume keys while the menu is open, otherwise always return false — the slash menu and ⌘B/⌘I/⌘K are unaffected
  return Prec.highest(
    keymap.of([
      { key: "ArrowDown", run: (v) => moveHighlight(v, 1) },
      { key: "ArrowUp", run: (v) => moveHighlight(v, -1) },
      { key: "Enter", run: pickCurrent },
      { key: "Tab", run: pickCurrent },
      {
        key: "Escape",
        run: (v) => {
          if (!wikiMenuStateOf(v.state)) return false;
          v.dispatch({ effects: closeWiki.of(true) });
          return true;
        },
      },
    ])
  );
}

/**
 * Assemble the extension. onState is called only when menu state actually changes (including null on close),
 * and MarkdownEditor forwards it to <WikiLinkMenu>; getDocs is read fresh on every filter, so library changes apply immediately.
 */
export function wikiLinkMenu(options: {
  getDocs: () => DocMeta[];
  onState: (s: WikiMenuState | null) => void;
}): Extension {
  return [
    wikiField,
    wikiKeymap(options.getDocs),
    EditorView.updateListener.of((update) => {
      const prev = update.startState.field(wikiField).open;
      const next = update.state.field(wikiField).open;
      if (prev !== next) options.onState(next);
    }),
    EditorView.domEventHandlers({
      // Close on blur; the menu's own onMouseDown calls preventDefault, so clicking the menu never gets here
      blur: (_e, view) => {
        if (wikiMenuStateOf(view.state)) view.dispatch({ effects: closeWiki.of(false) });
        return false;
      },
    }),
  ];
}
