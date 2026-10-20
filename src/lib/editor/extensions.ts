/** Where editor extensions are assembled: highlighting, caret, keys, live preview, etc. combined into CodeMirror's extension array. */

import { type Compartment, type Extension, type Text } from "@codemirror/state";
import { EditorView, drawSelection, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting } from "@codemirror/language";
import { styleTags, tags } from "@lezer/highlight";
import { searchKeymap } from "@codemirror/search";
import { editorSearch } from "@/lib/editor/searchPanel";
import { t } from "@/i18n/t";
import { livePreview } from "@/lib/livePreview";
import { codeHighlight, mdHighlight, sourceHeadingHighlight } from "@/lib/editor/highlight";
import { caretAndActiveLine } from "@/lib/editor/caret";
import { headingFolding } from "@/lib/editor/folding";
import { lineSelectionWithoutNewline } from "@/lib/lineSelection";
import { codeAwareSelection } from "@/lib/editor/codeSelection";
import type { Notify } from "@/lib/editor/commands";
import { formatShortcuts } from "@/lib/editor/shortcuts";
import { autoPairs } from "@/lib/editor/pairs";
import { tableKeymap } from "@/lib/editor/tableKeys";
import { listKeymap } from "@/lib/editor/listKeys";
import { slashMenu, type SlashState } from "@/lib/slashMenu";
import { editorClipboard } from "@/lib/editor/clipboard";
import { uploadPlaceholders } from "@/lib/editor/uploadPlaceholder";
import { wikiLinkExtension } from "@/lib/wikiLink/parser";
import { wikiLinkMenu, type WikiMenuState } from "@/lib/wikiLink/menu";
import type { SelectionInfo } from "@/lib/editor/types";
import type { DocMeta } from "@/features/workspace/types";
import { intrawordStarExtension } from "@/lib/markdown/intrawordStar";

interface EditorExtensionOptions {
  live: boolean;
  liveCompartment: Compartment;
  onChange: (doc: Text) => void;
  flush: () => void;
  onSelectionChange: (info: SelectionInfo) => void;
  onSlashChange: (state: SlashState | null) => void;
  onWikiMenuChange: (state: WikiMenuState | null) => void;
  /** Candidate source for `[[` completion: the editor is built once while the library keeps changing, so read it on demand */
  getDocs: () => DocMeta[];
  onScroll: (view: EditorView) => void;
  /** Messages from the command layer (uploading images/videos, etc.): lib doesn't import components, so the component passes toast in */
  notify: Notify;
}

export function editorModeExtension(live: boolean): Extension {
  return live ? livePreview : syntaxHighlighting(sourceHeadingHighlight);
}

/** Only assembles extensions; instance lifecycle and latest React callbacks are managed by MarkdownEditor. */
export function createEditorExtensions(options: EditorExtensionOptions): Extension[] {
  return [
    history(),
    drawSelection(),
    codeAwareSelection,
    lineSelectionWithoutNewline,
    caretAndActiveLine,
    EditorView.lineWrapping,
    // Taken from the current language when the editor is built; after switching language it applies on the next rebuild (switching docs, etc.)
    placeholder(t("在这里输入…")),
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
    // Disable Setext underline headings: typing "-" under a line to start a list would make
    // CommonMark instantly treat the previous line as H2, which looks like the editor glitching. WeChat writing only uses #.
    // Preview rendering (renderer.ts) and Feishu export disable it too, keeping all three parsers consistent.
      extensions: [
        { remove: ["SetextHeading"] },
        // @lezer/markdown tags fenced CodeText and inline InlineCode both as monospace,
        // so every line of a language-less code block got the inline-code purple pill. Retag as plain content:
        // code block background and monospace come from livePreview's line classes; inline code is unaffected.
        { props: [styleTags({ CodeText: tags.content })] },
        wikiLinkExtension,
        // A single * inside a word like `3*2` is treated literally, consistent with renderer.ts
        intrawordStarExtension,
      ],
    }),
    syntaxHighlighting(mdHighlight),
    syntaxHighlighting(codeHighlight),
    // Heading folding: fold ranges come from markdown()'s built-in foldService; the handle is a zero-width widget at the heading line start.
    // Placed before live preview: the click on the triangle must be consumed before livePreview's mousedown (freezing layout for drag-select),
    // otherwise it needlessly enters a "drag-selecting" state that doesn't unfreeze until the next mouseup.
    headingFolding,
    options.liveCompartment.of(editorModeExtension(options.live)),
    // The slash menu raises key priority internally via Prec.highest and only consumes navigation keys while open.
    slashMenu({ onState: options.onSlashChange, notify: options.notify }),
    // `[[` document-title completion: likewise only consumes keys while open; the two menus' triggers never overlap.
    wikiLinkMenu({ getDocs: options.getDocs, onState: options.onWikiMenuChange }),
    // ⌘F find/replace: localized panel pinned to the top, styles in app/editor.css; keys still go through searchKeymap below.
    editorSearch(),
    // The three below all use Prec.highest: they must run before markdownKeymap (Prec.high) and indentWithTab.
    // Placed after the two menus: at equal priority array order wins, so Enter/Tab still go to an open menu.
    tableKeymap,
    listKeymap,
    autoPairs,
    keymap.of([
      ...formatShortcuts(options.notify),
      {
        key: "Mod-s",
        run: () => {
          // The saver reads the store, so the last input in the throttle window must be synced first.
          options.flush();
          window.dispatchEvent(new CustomEvent("xedit:save-now"));
          return true;
        },
      },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange(update.state.doc);
      if (update.selectionSet || update.docChanged || update.focusChanged) {
        const { from, to, empty } = update.state.selection.main;
        options.onSelectionChange({ from, to, empty, hasFocus: update.view.hasFocus, docChanged: update.docChanged });
      }
    }),
    EditorView.domEventHandlers({
      // Switching docs, saving, and sharing may happen right after, so flush pending content on blur.
      blur: () => {
        options.flush();
        return false;
      },
      scroll: (_event, view) => {
        options.onScroll(view);
        return false;
      },
    }),
    editorClipboard(options.notify),
    // While media uploads, an "uploading" pill sits at the insertion point and the content lands when done (shared by paste, drop, and file picker)
    uploadPlaceholders,
  ];
}
