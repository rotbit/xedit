/**
 * 成对符号：自动补右半边、选中文字后一键包裹、退格连着删。
 *
 * 不用 @codemirror/autocomplete 的 closeBrackets：它虽然躺在 node_modules 里（被
 * lang-markdown 间接带进来），但并不在 package.json 的依赖表里，直接 import 等于
 * 赌包管理器的扁平化结果；而且中文写作要的几条规则（「」《》等全角对、`*` `~` 这类
 * 非括号的包裹标记、撇号不补）都得绕开它的配置，自己写一个 inputHandler 反而更短。
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

/** 会自动补右半边的成对符号。全角那几对是中文正文里真正高频的，半角括号反而少 */
const PAIRS: Readonly<Record<string, string>> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
  "`": "`",
  "（": "）",
  "「": "」",
  "『": "』",
  "《": "》",
  "【": "】",
  "“": "”",
  "‘": "’",
};

/** 只在「有选区」时充当包裹符：单敲一个 `*` 是在写乘号或想打星号，补成 `**` 只会碍事 */
const WRAP_ONLY = new Set(["*", "_", "~", "$", "="]);

/** 右边是这些字符（或行尾）才补右半边：紧贴着文字补，会把后面的词整个圈进括号里 */
const CLOSE_BEFORE = /[\s)\]}>）】」』》”’,.;:!?，。；：！？、]/u;

/** 词尾的撇号是单词的一部分（don't、it's），补成 don''t 是最招人烦的一种"智能" */
const WORD_END = /[\p{L}\p{N}]$/u;

function pairFor(ch: string): readonly [string, string] | null {
  const close = PAIRS[ch];
  if (close) return [ch, close];
  return WRAP_ONLY.has(ch) ? [ch, ch] : null;
}

/** 代码里的括号引号是语法不是标点（正则、字符串、数组下标），一律不插手 */
function inCode(state: EditorState, pos: number): boolean {
  if (caretInFencedCode(state)) return true;
  for (const side of [-1, 1] as const) {
    for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side); n; n = n.parent) {
      if (n.name === "InlineCode" || n.name === "CodeText" || n.name === "CodeBlock") return true;
    }
  }
  return false;
}

/** 刚补出来的那个右半边的位置 */
const markAutoClose = StateEffect.define<number>();
/** 用户打了一遍右半边、已经跳过去了：这个位置不再享受"跳过"待遇 */
const dropAutoClose = StateEffect.define<number>();

/**
 * 自动补出来的右半边位置表。
 *
 * 只有记在册的那些才允许被"打一遍跳过去"——否则在 `f(a|)` 里想再敲一个 `)` 补成
 * `f(a))` 就永远打不出来。位置随文档改动映射：assoc=1 让光标处的插入把它往右推，
 * TrackAfter 让它在自己那个字符被删掉时出局。
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

/** 选中文字时敲 `(`、`*`：意思是"给这段套个壳"，而不是"用这个字符换掉这段" */
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
            // 选区留在内容上：连敲两下 `*` 就是 **加粗**，再套一层括号也顺手
            range: EditorSelection.range(range.from + open.length, range.to + open.length),
          }
    ),
    { userEvent: "input.type", scrollIntoView: true }
  );
  return true;
}

function handleInput(view: EditorView, from: number, to: number, text: string): boolean {
  // 输入法组合期间这里会逐字回调，插进右半边会顶掉候选框，也会被随后的整段替换弄乱
  if (view.composing || view.compositionStarted) return false;
  if (text.length !== 1) return false;
  const { state } = view;
  const main = state.selection.main;
  // 只认"用户在主选区上敲的这一下"：程序化插入、拖拽等一律走默认路径
  if (main.from !== from || main.to !== to) return false;

  // 先试"跳过"，而且必须排在查配对表之前：`)` `》` 这些右半边自己不是"开符号"，
  // 查表会直接落空返回；同字符的引号、反引号也得先判这条，否则永远在原地补新的
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
    // `*` `~` 这类是 Markdown 标记，包裹代码里的文字没有意义；括号引号则到处都能包
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

/** 空的一对里退格：把两半一起删掉，省得留下个孤零零的右括号 */
function deleteEmptyPair(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty || range.head === 0) return false;
  const before = state.sliceDoc(range.head - 1, range.head);
  if (!PAIRS[before] || PAIRS[before] !== state.sliceDoc(range.head, range.head + 1)) return false;
  // 代码块里不补也不删：围栏内的删除键归 livePreview/fenceKeys 管，别抢它的活
  if (inCode(state, range.head)) return false;
  view.dispatch({
    changes: { from: range.head - 1, to: range.head + 1 },
    userEvent: "delete.backward",
    scrollIntoView: true,
  });
  return true;
}

/** Backspace 用 Prec.highest 抢在 markdownKeymap 的 deleteMarkupBackward 之前；
 *  不在成对符号中间时立刻返回 false，围栏/列表的删除行为原样不动 */
export const autoPairs: Extension = [
  autoClosed,
  EditorView.inputHandler.of(handleInput),
  Prec.highest(keymap.of([{ key: "Backspace", run: deleteEmptyPair }])),
];
