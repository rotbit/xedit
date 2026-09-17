import type { EditorView } from "@codemirror/view";

/**
 * 编辑器的滚动坐标换算。从 MarkdownEditor.tsx 抽出来只为控制单文件长度，逻辑未变。
 *
 * 首页文章视图把标题区与正文放进同一个外层滚动容器，此时 .cm-scroller 不再滚动
 * （overflow:visible），滚动读写都要改指向那个外层容器 —— 下面每个函数的 parent
 * 参数就是它，为 null 时退化为 CodeMirror 自己的滚动容器。
 */

/** 容器顶端落在文档坐标系里的高度。documentTop 正是 lineBlockAt* 那套坐标的原点，
    用它换算就不必关心 content 的内边距与容器嵌套层数 */
export function docTopOffset(view: EditorView, parent: HTMLElement | null): number {
  if (!parent) return view.scrollDOM.scrollTop;
  return parent.getBoundingClientRect().top - view.documentTop;
}

/** 报告当前滚到了哪一行（双屏同步滚动用） */
export function reportScrollLine(
  view: EditorView,
  parent: HTMLElement | null,
  cb: (line: number, ratio: number) => void
) {
  const top = Math.max(0, docTopOffset(view, parent));
  const block = view.lineBlockAtHeight(top);
  const line = view.state.doc.lineAt(block.from).number - 1;
  const ratio = block.height > 0 ? Math.min(1, Math.max(0, (top - block.top) / block.height)) : 0;
  cb(line, ratio);
}

/**
 * 按「顶端第几行 + 行内比例」精确还原滚动位置（每篇文章记忆滚动位置用）。
 *
 * 与 scrollLineIntoView 的区别只在落点：那个把整行对齐到容器顶端（跳转用），
 * 这个要把 reportScrollLine 报上去的那一刻原样放回来 —— 长段落、大图占一行时
 * 只对齐行首会往回跳一大截，所以行内比例也得还原。恒定无动画：恢复是「页面本来就该
 * 在这里」，滚动动画反而让人以为自己碰到了什么。
 */
export function scrollToLineRatio(
  view: EditorView,
  parent: HTMLElement | null,
  line: number,
  ratio: number
): void {
  // 记录之后文章被别处改短是常事，行号一律夹回文档范围内
  const n = Math.min(view.state.doc.lines, Math.max(1, line + 1));
  const block = view.lineBlockAt(view.state.doc.line(n).from);
  const top = block.top + block.height * Math.min(1, Math.max(0, ratio));
  if (parent) {
    const delta = view.documentTop - parent.getBoundingClientRect().top;
    parent.scrollTo({ top: Math.max(0, parent.scrollTop + delta + top), behavior: "auto" });
  } else {
    view.scrollDOM.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  }
}

/** 把某行滚到容器顶端（留 margin 的余量），返回该行起点 */
export function scrollLineIntoView(
  view: EditorView,
  parent: HTMLElement | null,
  line: number,
  margin: number,
  smooth: boolean
): number {
  const n = Math.min(view.state.doc.lines, Math.max(1, line + 1));
  const pos = view.state.doc.line(n).from;
  const blockTop = view.lineBlockAt(pos).top;
  const behavior: ScrollBehavior = smooth ? "smooth" : "auto";
  if (parent) {
    const delta = view.documentTop - parent.getBoundingClientRect().top;
    parent.scrollTo({ top: Math.max(0, parent.scrollTop + delta + blockTop - margin), behavior });
  } else {
    view.scrollDOM.scrollTo({ top: Math.max(0, blockTop - margin), behavior });
  }
  return pos;
}
