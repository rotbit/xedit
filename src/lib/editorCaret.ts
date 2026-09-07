import { StateField, type Extension } from "@codemirror/state";
import { EditorView, highlightActiveLine } from "@codemirror/view";

/**
 * 光标与当前行的观感扩展：平滑光标 + 当前行底色的开关条件。
 * 样式本体在 editor.css / live-preview.css，这里只负责下发状态类。
 *
 * 三个状态类全部走 editorAttributes.compute 下发，不手动改 classList：
 * CodeMirror 同步根元素属性是整串 setAttribute("class")，手动加的类会在别处任何一次
 * 属性重算时被抹掉；而且 compute 在 update 阶段就把类写好，先于光标层的 measure 绘制，
 * 时序天然正确，不需要定时器，也不受后台标签页 rAF 停摆影响。
 */

/**
 * 上一次事务是否改了文档。只让「跳光标」享受平滑：点击定位、上下键翻行。
 * 打字时光标必须紧跟刚敲出的字符，带过渡会拖出一条残影、看起来像先退回再追上，
 * 所以文档一变就摘掉过渡类，下一次纯选区移动再装回。
 */
const lastTrChangedDoc = StateField.define<boolean>({
  create: () => false,
  update: (_prev, tr) => tr.docChanged,
});

const smoothCaretClass = EditorView.editorAttributes.compute([lastTrChangedDoc], (state) => ({
  class: state.field(lastTrChangedDoc) ? "" : "cm-caret-smooth",
}));

/**
 * 有非空选区时给编辑器根打 cm-has-selection：当前行底色要让位给选区高亮，
 * 否则一块淡底压在选区上，选中范围的边界就读不清了。
 */
const selectionRootClass = EditorView.editorAttributes.compute(["selection"], (state) => ({
  class: state.selection.ranges.some((r) => !r.empty) ? "cm-has-selection" : "",
}));

export const caretAndActiveLine: Extension = [
  highlightActiveLine(),
  lastTrChangedDoc,
  smoothCaretClass,
  selectionRootClass,
];
