import { type Compartment, type Extension, type Text } from "@codemirror/state";
import { EditorView, drawSelection, keymap, placeholder, type KeyBinding } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { livePreview } from "@/lib/livePreview";
import { codeHighlight, mdHighlight, sourceHeadingHighlight } from "@/lib/editorHighlight";
import { caretAndActiveLine } from "@/lib/editorCaret";
import { lineSelectionWithoutNewline } from "@/lib/lineSelection";
import { runFormatCommand, type FormatCommand } from "@/lib/editorCommands";
import { slashMenu, type SlashState } from "@/lib/slashMenu";
import { editorClipboard } from "@/lib/editorClipboard";
import type { SelectionInfo } from "@/lib/editorTypes";

interface EditorExtensionOptions {
  live: boolean;
  liveCompartment: Compartment;
  onChange: (doc: Text) => void;
  flush: () => void;
  onSelectionChange: (info: SelectionInfo) => void;
  onSlashChange: (state: SlashState | null) => void;
  onScroll: (view: EditorView) => void;
}

/** 快捷键与工具栏、斜杠菜单共用命令入口，格式行为只在命令层定义。 */
function formatKey(key: string, command: FormatCommand): KeyBinding {
  return {
    key,
    run: (view) => {
      runFormatCommand(view, command);
      return true;
    },
  };
}

export function editorModeExtension(live: boolean): Extension {
  return live ? livePreview : syntaxHighlighting(sourceHeadingHighlight);
}

/** 只负责组装扩展；实例生命周期与最新 React 回调由 MarkdownEditor 管理。 */
export function createEditorExtensions(options: EditorExtensionOptions): Extension[] {
  return [
    history(),
    drawSelection(),
    lineSelectionWithoutNewline,
    caretAndActiveLine,
    EditorView.lineWrapping,
    placeholder("在这里输入…"),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(mdHighlight),
    syntaxHighlighting(codeHighlight),
    options.liveCompartment.of(editorModeExtension(options.live)),
    // 斜杠菜单内部通过 Prec.highest 提升按键优先级，只在菜单打开时消费导航按键。
    slashMenu(options.onSlashChange),
    keymap.of([
      formatKey("Mod-b", "bold"),
      formatKey("Mod-i", "italic"),
      formatKey("Mod-k", "link"),
      {
        key: "Mod-s",
        run: () => {
          // 保存方读取 store，必须先同步节流窗口里的最后一次输入。
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
      // 切文档、保存和分享可能紧接着发生，失焦时先交出待同步内容。
      blur: () => {
        options.flush();
        return false;
      },
      scroll: (_event, view) => {
        options.onScroll(view);
        return false;
      },
    }),
    editorClipboard,
  ];
}
