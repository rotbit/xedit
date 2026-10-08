/**
 * ⌘F 查找替换面板：@codemirror/search 自带面板的本地化与定位配置。
 *
 * 面板的 DOM 由 @codemirror/search 自己生成（结构改不了），能动的只有两处：
 * 1) phrases —— 官方把每个可见字串都过了 `state.phrase()`，注入译名即可整块本地化
 *    （中文原文走 t()，英文界面拿到字典里的英文；切换语言时经 compartment 重配，下次打开面板即生效）；
 * 2) 样式 —— 见 app/editor.css 的「查找替换面板」一节，全部走主题变量，明暗两套通用。
 * 所以这里只负责「装什么扩展 + 说什么话」，视觉留在 CSS 里，两边各管一摊。
 */

import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { t, tk } from "@/i18n/t";
import { LOCALE_CHANGED_EVENT } from "@/i18n/locale";

/**
 * @codemirror/search 会用到的全部 phrase。键必须与源码里的英文原文逐字一致
 * （见 node_modules/@codemirror/search/dist/index.js 的 `phrase(view, ...)` 调用），
 * 漏一条就会在面板上露出一个英文词。`$` 是官方的占位符，译文里要原样保留。
 * 值存中文原文（tk 标记），装配时再 t()：英文界面也走字典，按钮写法与产品其他地方一致。
 */
const SEARCH_PHRASES: Record<string, string> = {
  // 面板上看得见的：输入框占位符、三个按钮、三个勾选项、关闭按钮
  Find: tk("查找"),
  Replace: tk("替换"),
  next: tk("下一个"),
  previous: tk("上一个"),
  all: tk("全选匹配"),
  "match case": tk("区分大小写"),
  regexp: tk("正则"),
  "by word": tk("全词匹配"),
  replace: tk("替换"),
  "replace all": tk("全部替换"),
  close: tk("关闭"),
  // 读屏播报：跳到某处匹配、替换完成后由 EditorView.announce 播出去
  "current match": tk("当前匹配"),
  "on line": tk("位于第"),
  "replaced match on line $": tk("已替换第 $ 行的一处匹配"),
  "replaced $ matches": tk("已替换 $ 处匹配"),
  // ⌘⌥G 的跳转到行对话框
  "Go to line": tk("跳转到行"),
  go: tk("跳转"),
};

/** 按当前语言把 phrase 表翻一遍；放进函数里现取，模块加载时固定下来就跟不上语言切换 */
function phrasesNow(): Extension {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(SEARCH_PHRASES)) out[k] = t(v);
  return EditorState.phrases.of(out);
}

const phrasesCompartment = new Compartment();

/** 切换界面语言时重配 phrase：面板已开着的不强刷，关掉再开（或 ⌘F）就是新语言 */
const localeSync = ViewPlugin.fromClass(
  class {
    private readonly onChange: () => void;
    constructor(view: EditorView) {
      this.onChange = () => view.dispatch({ effects: phrasesCompartment.reconfigure(phrasesNow()) });
      window.addEventListener(LOCALE_CHANGED_EVENT, this.onChange);
    }
    destroy() {
      window.removeEventListener(LOCALE_CHANGED_EVENT, this.onChange);
    }
  }
);

/**
 * 装配查找扩展。
 * - top: true —— 面板停在编辑区顶部。底部那档在首页文章视图里会贴着窗口下沿，
 *   离正文和光标都远；顶部配合 CSS 的 sticky 才能一直跟着视线。
 * - highlightSelectionMatches —— 选中一段文字，正文里同样的片段一起浅浅标出来。
 *   门槛提到 2 个字符：选中单个字符（尤其中文）几乎整页都会亮，反而成了干扰；
 *   highlightWordAroundCursor 保持关闭，只认「真的选了一段」，不猜光标旁的词。
 */
export function editorSearch(): Extension[] {
  return [
    search({ top: true }),
    highlightSelectionMatches({ minSelectionLength: 2, highlightWordAroundCursor: false }),
    // 每建一个编辑器现取一次当前语言：写成模块常量会在加载那一刻定死
    phrasesCompartment.of(phrasesNow()),
    localeSync,
  ];
}
