/** 编辑器扩展的组装处：把高亮、光标、按键、即时渲染等扩展拼成 CodeMirror 的扩展数组。 */

import { type Compartment, type Extension, type Text } from "@codemirror/state";
import { EditorView, drawSelection, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { editorSearch } from "@/lib/editor/searchPanel";
import { livePreview } from "@/lib/livePreview";
import { codeHighlight, mdHighlight, sourceHeadingHighlight } from "@/lib/editor/highlight";
import { caretAndActiveLine } from "@/lib/editor/caret";
import { headingFolding } from "@/lib/editor/folding";
import { lineSelectionWithoutNewline } from "@/lib/lineSelection";
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

interface EditorExtensionOptions {
  live: boolean;
  liveCompartment: Compartment;
  onChange: (doc: Text) => void;
  flush: () => void;
  onSelectionChange: (info: SelectionInfo) => void;
  onSlashChange: (state: SlashState | null) => void;
  onWikiMenuChange: (state: WikiMenuState | null) => void;
  /** `[[` 补全的候选来源：编辑器只建一次，文库随时在变，所以现读现取 */
  getDocs: () => DocMeta[];
  onScroll: (view: EditorView) => void;
  /** 命令层（上传图片/视频等）要弹的提示：lib 不 import components，由组件传 toast 进来 */
  notify: Notify;
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
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
      // 关掉 Setext 下划线标题：在一行文字下面刚敲出 "-" 准备列列表时，
      // CommonMark 会把上一行瞬间判成 H2，看起来像编辑器抽风。公众号写作只用 #。
      // 预览渲染（renderer.ts）与飞书导出同步关闭，保证三处解析一致。
      extensions: [{ remove: ["SetextHeading"] }, wikiLinkExtension],
    }),
    syntaxHighlighting(mdHighlight),
    syntaxHighlighting(codeHighlight),
    // 标题折叠：折叠范围借 markdown() 自带的 foldService，把手是标题行首的零宽 widget。
    // 排在即时渲染之前 —— 点三角那一下要抢在 livePreview 的 mousedown（拖选布局冻结）前面
    // 消费掉，否则会白白进入一次「拖选中」状态，直到下次 mouseup 才解冻。
    headingFolding,
    options.liveCompartment.of(editorModeExtension(options.live)),
    // 斜杠菜单内部通过 Prec.highest 提升按键优先级，只在菜单打开时消费导航按键。
    slashMenu({ onState: options.onSlashChange, notify: options.notify }),
    // `[[` 文章标题补全：同样只在打开时消费按键，两个菜单的触发条件互不重叠。
    wikiLinkMenu({ getDocs: options.getDocs, onState: options.onWikiMenuChange }),
    // ⌘F 查找替换：面板中文化 + 停在顶部，样式见 app/editor.css；按键仍走下面的 searchKeymap。
    editorSearch,
    // 下面三个都用 Prec.highest：要抢在 markdownKeymap（Prec.high）和 indentWithTab 前面。
    // 排在两个菜单之后 —— 同优先级按数组顺序先到先得，菜单开着时 Enter/Tab 仍归菜单。
    tableKeymap,
    listKeymap,
    autoPairs,
    keymap.of([
      ...formatShortcuts(options.notify),
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
    editorClipboard(options.notify),
    // 媒体上传期间在落点挂「上传中」小牌子，传完再落笔（粘贴、拖放、选文件三条路共用）
    uploadPlaceholders,
  ];
}
