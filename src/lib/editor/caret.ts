import { StateField, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * 光标观感扩展：平滑光标的开关条件。样式本体在 editor.css，这里只负责下发状态类。
 * 当前行底色已去掉：文档感排版里光标本身足够定位，多一层底反而成了第二种版式元素。
 *
 * 状态类走 editorAttributes.compute 下发，不手动改 classList：
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

export const caretAndActiveLine: Extension = [
  lastTrChangedDoc,
  smoothCaretClass,
];
