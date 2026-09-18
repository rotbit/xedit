import type { SyntaxNodeRef } from "@lezer/common";
import { CodeLangWidget } from "@/lib/livePreview/widgets";
import type { LpContext } from "@/lib/livePreview/context";

/**
 * 围栏代码块的即时渲染：整块铺随主题的浅色卡片、开栏行换成带语言下拉的标题条、闭栏行折成块底内边距。
 *
 * 行缝的成因值得记一笔：底色画在每行的 ::before 上，而行高是分数像素，相邻行之间
 * 会漏出亮线。解决办法是让相邻行的伪元素上下各外扩 1px 互相重叠（CSS 里的
 * cm-lp-code-mid），首尾行不外扩以保住圆角边缘。
 */
export function fencedCodeDecorations(ctx: LpContext, node: SyntaxNodeRef): void {
  const { state } = ctx;
  ctx.codeRanges.push({ from: node.from, to: node.to });

  ctx.eachLine(node.from, node.to, (n, first, last) =>
    n === first
      ? "cm-lp-code cm-lp-code-first"
      : n === last
        ? "cm-lp-code cm-lp-code-last"
        : "cm-lp-code cm-lp-code-mid"
  );

  // 下面这几样一律按节点位置取行，不受 eachLine 可见区裁剪的影响：
  // 滚到长代码块中段时开栏行远在视口之上，首行标题条/闭栏行内边距照旧挂在真正的首末行上
  // （视口外的装饰本就不渲染），绝不会把视口里的中间行误当成开栏行
  const marks = node.node.getChildren("CodeMark");
  const info = node.node.getChild("CodeInfo");
  const firstLine = state.doc.lineAt(node.from);

  // 开栏行换语言下拉：光标落到该行才还原 ``` 源码，平时这一行只当块顶留白
  if (marks.length > 0 && !ctx.lineActive(firstLine.from)) {
    const lang = info ? state.sliceDoc(info.from, info.to).trim() : "";
    ctx.replaceAtomic(
      firstLine.from,
      firstLine.to,
      new CodeLangWidget(lang, marks[0].to, firstLine.to)
    );
  }

  if (marks.length < 2) return;
  const lastLine = state.doc.lineAt(marks[marks.length - 1].from);
  if (lastLine.number === firstLine.number || lastLine.from >= lastLine.to) return;
  // 闭栏行被整行隐藏后文字没了、行高还在，块底会多出一条空行。
  // 行级类把它压成一条固定高度的块底内边距（不能 display:none，CodeMirror 要求每行可测高）。
  // 关键是这个类两种状态都下发：以前光标一落到闭栏行类就撤掉，行高从 12px 弹回 22px+10px，
  // 整篇下文被顶开二十来像素——只是把光标挪过去而已，不该有这种跳动。
  // 现在行盒高度钉死，光标在这一行时不替换、``` 以同样高度的小号淡字现出（见 CSS）
  ctx.lineClass(lastLine.from, "cm-lp-code-close");
  if (ctx.lineActive(lastLine.from)) return;
  ctx.replaceAtomic(lastLine.from, lastLine.to);
}
