import type { SyntaxNodeRef } from "@lezer/common";
import { CodeLangWidget } from "@/lib/livePreview/widgets";
import { caretTouches, selectionTouches, type LpContext } from "@/lib/livePreview/context";

/**
 * 围栏代码块的即时渲染：整块铺随主题的浅色卡片、开栏行换成带语言下拉的标题条、闭栏行折成块底内边距。
 *
 * 行缝的成因值得记一笔：底色画在每行的 ::before 上，而行高是分数像素，相邻行之间
 * 会漏出亮线。解决办法是让相邻行的伪元素上下各外扩 1px 互相重叠（CSS 里的
 * cm-lp-code-mid），首尾行不外扩以保住圆角边缘。
 */
export function fencedCodeDecorations(ctx: LpContext, node: SyntaxNodeRef): void {
  const { state, caret } = ctx;
  ctx.codeRanges.push({ from: node.from, to: node.to });

  ctx.eachLine(node.from, node.to, (n, first, last) =>
    n === first
      ? "cm-lp-code cm-lp-code-first"
      : n === last
        ? "cm-lp-code cm-lp-code-last"
        : "cm-lp-code cm-lp-code-mid"
  );

  const marks = node.node.getChildren("CodeMark");
  const info = node.node.getChild("CodeInfo");
  const firstLine = state.doc.lineAt(node.from);

  // 开栏行换语言下拉：光标落到该行才还原 ``` 源码，平时这一行只当块顶留白
  if (
    marks.length > 0 &&
    !caretTouches(caret, firstLine.from, firstLine.to) &&
    !selectionTouches(state, firstLine.from, firstLine.to)
  ) {
    const lang = info ? state.sliceDoc(info.from, info.to).trim() : "";
    ctx.replaceAtomic(
      firstLine.from,
      firstLine.to,
      new CodeLangWidget(lang, marks[0].to, firstLine.to)
    );
  }

  if (marks.length < 2) return;
  const lastLine = state.doc.lineAt(marks[marks.length - 1].from);
  if (
    lastLine.number === firstLine.number ||
    lastLine.from >= lastLine.to ||
    caretTouches(caret, lastLine.from, lastLine.to) ||
    selectionTouches(state, lastLine.from, lastLine.to)
  ) {
    return;
  }
  // 闭栏行被整行隐藏后文字没了、行高还在，块底会多出一条空行。
  // 额外挂一个行级类把它压成纯内边距（不能 display:none，CodeMirror 要求每行可测高）；
  // 光标进入该行时装饰不再生效，类也随之消失，``` 与正常行高一起回来。
  ctx.lineClass(lastLine.from, "cm-lp-code-last-hidden");
  ctx.replaceAtomic(lastLine.from, lastLine.to);
}
