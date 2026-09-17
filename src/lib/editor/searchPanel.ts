/**
 * ⌘F 查找替换面板：@codemirror/search 自带面板的本地化与定位配置。
 *
 * 面板的 DOM 由 @codemirror/search 自己生成（结构改不了），能动的只有两处：
 * 1) phrases —— 官方把每个可见字串都过了 `state.phrase()`，注入译名即可整块中文化；
 * 2) 样式 —— 见 app/editor.css 的「查找替换面板」一节，全部走主题变量，明暗两套通用。
 * 所以这里只负责「装什么扩展 + 说什么话」，视觉留在 CSS 里，两边各管一摊。
 */

import { EditorState, type Extension } from "@codemirror/state";
import { highlightSelectionMatches, search } from "@codemirror/search";

/**
 * @codemirror/search 会用到的全部 phrase。键必须与源码里的英文原文逐字一致
 * （见 node_modules/@codemirror/search/dist/index.js 的 `phrase(view, ...)` 调用），
 * 漏一条就会在面板上露出一个英文词。`$` 是官方的占位符，译文里要原样保留。
 */
const SEARCH_PHRASES: Record<string, string> = {
  // 面板上看得见的：输入框占位符、三个按钮、三个勾选项、关闭按钮
  Find: "查找",
  Replace: "替换",
  next: "下一个",
  previous: "上一个",
  all: "全选匹配",
  "match case": "区分大小写",
  regexp: "正则",
  "by word": "全词匹配",
  replace: "替换",
  "replace all": "全部替换",
  close: "关闭",
  // 读屏播报：跳到某处匹配、替换完成后由 EditorView.announce 播出去
  "current match": "当前匹配",
  "on line": "位于第",
  "replaced match on line $": "已替换第 $ 行的一处匹配",
  "replaced $ matches": "已替换 $ 处匹配",
  // ⌘⌥G 的跳转到行对话框
  "Go to line": "跳转到行",
  go: "跳转",
};

/**
 * 装配查找扩展。
 * - top: true —— 面板停在编辑区顶部。底部那档在首页文章视图里会贴着窗口下沿，
 *   离正文和光标都远；顶部配合 CSS 的 sticky 才能一直跟着视线。
 * - highlightSelectionMatches —— 选中一段文字，正文里同样的片段一起浅浅标出来。
 *   门槛提到 2 个字符：选中单个字符（尤其中文）几乎整页都会亮，反而成了干扰；
 *   highlightWordAroundCursor 保持关闭，只认「真的选了一段」，不猜光标旁的词。
 */
export const editorSearch: Extension[] = [
  search({ top: true }),
  highlightSelectionMatches({ minSelectionLength: 2, highlightWordAroundCursor: false }),
  EditorState.phrases.of(SEARCH_PHRASES),
];
