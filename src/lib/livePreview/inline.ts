import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { Decoration } from "@codemirror/view";
import { isAttachmentSrc, resolveAttachmentSrc } from "@/lib/localBackend/attachmentUrls";
import { isVideoUrl, posterFromTitle } from "@/lib/media";
import { HrWidget, ImageWidget, VideoWidget } from "@/lib/livePreview/widgets";
import { caretInside, caretTouches, type LpContext } from "@/lib/livePreview/context";
import { COLOR_SPAN_OPEN_EXACT } from "@/lib/editor/colorSpan";

/**
 * 行内语法的即时渲染分支（强调、行内代码、删除线、链接、颜色 span、图片/视频、分割线）。
 * 从 livePreview/index.ts 里抽出来只为控制单文件长度，行为与判定规则未变：
 * 光标进入该语法范围内才显示标记，位移只发生在焦点处。
 */

/**
 * 光标进入行内语法时现出的标记（**、*、~~、`）。
 * 直接现出原文会把同行文字向右推出一大截，看着像整行在抖；缩到 0.75em 再挤掉字距，
 * 占位只剩原来的一半多一点，抖动幅度随之减半。line-height 是无单位继承值，
 * 会跟着这里的字号一起缩小，所以行高不受影响、不会引起竖向跳动。
 */
const INLINE_MARK = Decoration.mark({ class: "cm-lp-mark-inline" });

/** 给一组标记节点铺上缩小淡化的样式（空区间会被 RangeSet 拒绝，先滤掉） */
function softenMarks(ctx: LpContext, marks: readonly SyntaxNode[]) {
  for (const m of marks) if (m.from < m.to) ctx.decos.push(INLINE_MARK.range(m.from, m.to));
}

/** 由 livePreview 的装饰构建分发到这里的节点名 */
export const INLINE_NODE_NAMES = new Set([
  "Emphasis",
  "StrongEmphasis",
  "HTMLTag",
  "InlineCode",
  "Strikethrough",
  "Link",
  "URL",
  "Image",
  "HorizontalRule",
  "WikiLink",
]);

/** 返回 false 表示不再深入子节点（与 CodeMirror iterate 的约定一致） */
export function inlineDecorations(ctx: LpContext, node: SyntaxNodeRef): false | void {
  const { state, caret } = ctx;
  const { name } = node;

  if (name === "Emphasis" || name === "StrongEmphasis") {
    const marks = node.node.getChildren("EmphasisMark");
    if (caretTouches(caret, node.from, node.to)) softenMarks(ctx, marks);
    else for (const m of marks) ctx.hide(m.from, m.to);
    return;
  }

  if (name === "HTMLTag") {
    // 工具栏字体颜色写出的 <span style="color:…">…</span>：
    // 隐藏首尾标签、中间文字直接上色；光标进入范围才还原源码可编辑
    const open = state.sliceDoc(node.from, node.to).match(COLOR_SPAN_OPEN_EXACT);
    if (!open) return;
    // 向后找配对的 </span>（中间可能嵌套别的 span，按深度计数）
    let depth = 1;
    let close: SyntaxNode | null = null;
    for (let sib = node.node.nextSibling; sib; sib = sib.nextSibling) {
      if (sib.name !== "HTMLTag") continue;
      const t = state.sliceDoc(sib.from, sib.to);
      if (/^<span[\s>]/i.test(t)) depth++;
      else if (/^<\/span\s*>$/i.test(t) && --depth === 0) {
        close = sib;
        break;
      }
    }
    if (!close || caretTouches(caret, node.from, close.to)) return;
    ctx.hide(node.from, node.to);
    ctx.hide(close.from, close.to);
    if (close.from > node.to) {
      ctx.decos.push(
        Decoration.mark({ attributes: { style: `color:${open[1]}` } }).range(node.to, close.from)
      );
    }
    return;
  }

  if (name === "InlineCode") {
    const marks = node.node.getChildren("CodeMark");
    if (caretTouches(caret, node.from, node.to)) {
      softenMarks(ctx, marks);
    } else {
      for (const m of marks) ctx.hide(m.from, m.to);
      // 内容打上胶囊样式（内衬 + 圆角），只作用于行内代码，不波及代码块
      if (marks.length >= 2 && marks[1].from > marks[0].to) {
        ctx.decos.push(Decoration.mark({ class: "cm-lp-ic" }).range(marks[0].to, marks[1].from));
      }
    }
    return;
  }

  if (name === "Strikethrough") {
    const marks = node.node.getChildren("StrikethroughMark");
    if (caretTouches(caret, node.from, node.to)) softenMarks(ctx, marks);
    else for (const m of marks) ctx.hide(m.from, m.to);
    return;
  }

  if (name === "Link") {
    const n = node.node;
    if (caretTouches(caret, node.from, node.to)) {
      // 编辑链接时现出的源码是全篇位移最大的一处（一条 URL 能有几十个字符）。
      // URL 不截断也不 replace —— 要能正常编辑 —— 只把 "](url)" 整段缩小淡化，
      // 前面的 "[" 按行内标记处理，位移就压到可接受的范围
      const marks = n.getChildren("LinkMark");
      if (marks.length > 0) softenMarks(ctx, [marks[0]]);
      if (marks.length >= 2 && marks[1].from < node.to) {
        ctx.decos.push(Decoration.mark({ class: "cm-lp-url" }).range(marks[1].from, node.to));
      }
      return;
    }
    const marks = n.getChildren("LinkMark");
    const url = n.getChild("URL");
    const title = n.getChild("LinkTitle");
    for (const m of marks) ctx.hide(m.from, m.to);
    if (url) ctx.hide(url.from, url.to);
    if (title) ctx.hide(title.from, title.to);
    // 链接文字提示 URL，点击直接打开（⌥+点击进入源码编辑）
    const href = url ? state.sliceDoc(url.from, url.to) : "";
    if (href && marks.length >= 2 && marks[1].from > marks[0].to) {
      ctx.decos.push(
        Decoration.mark({
          class: "cm-lp-link",
          attributes: { "data-lp-href": href, title: `${href}\n点击打开 · ⌥+点击编辑` },
        }).range(marks[0].to, marks[1].from)
      );
    }
    return;
  }

  if (name === "URL") {
    // 裸链接 / 自动链接：Link、Image 里的 URL 已由整体处理，这里只管独立出现的
    const parent = node.node.parent?.name;
    if (parent === "Link" || parent === "Image") return;
    if (caretTouches(caret, node.from, node.to)) return; // 编辑中不拦点击
    const raw = state.sliceDoc(node.from, node.to);
    const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    ctx.decos.push(
      Decoration.mark({
        class: "cm-lp-link",
        attributes: { "data-lp-href": href, title: "点击打开 · ⌥+点击编辑" },
      }).range(node.from, node.to)
    );
    return;
  }

  if (name === "WikiLink") {
    // `[[目标]]` / `[[目标|显示文字]]`：渲染成只剩显示文字的站内链接。
    // 子节点已在这里整体处理完，返回 false 不再深入
    const n = node.node;
    const marks = n.getChildren("WikiLinkMark");
    if (caretTouches(caret, node.from, node.to)) {
      softenMarks(ctx, marks); // 编辑时现出 [[ | ]]，与其他行内标记同一套淡化处理
      return false;
    }
    const targetNode = n.getChild("WikiLinkTarget");
    const aliasNode = n.getChild("WikiLinkAlias");
    const target = targetNode ? state.sliceDoc(targetNode.from, targetNode.to).trim() : "";
    if (!target) return false;
    for (const m of marks) ctx.hide(m.from, m.to);
    // 有别名时目标标题也一并藏起来，只留别名——与 Obsidian 的显示一致
    if (aliasNode && targetNode) ctx.hide(targetNode.from, targetNode.to);
    const textFrom = aliasNode ? aliasNode.from : targetNode?.from;
    const textTo = aliasNode ? aliasNode.to : targetNode?.to;
    if (textFrom !== undefined && textTo !== undefined && textTo > textFrom) {
      ctx.decos.push(
        Decoration.mark({
          class: "cm-lp-wikilink",
          attributes: {
            "data-lp-wiki": target,
            title: `打开「${target}」 · ⌥+点击编辑`,
          },
        }).range(textFrom, textTo)
      );
    }
    return false;
  }

  if (name === "Image") {
    // 图片/视频的还原判定含边界（caretTouches 而非 caretInside）：点击部件把光标送到 from+2，
    // 之后在这行源码里挪到行首或 `)` 之后就踩在 from/to 上——按严格内部判定会当场翻回图片，
    // 同一行里移动光标于是来回闪。只认光标不认选区：全选/拖选时每张图都多出一行源码，
    // 版面会整体抖一下，而图片被选中时本来就看得出来（整块高亮），不必现原文。
    const editing = caretTouches(caret, node.from, node.to);
    const n = node.node;
    const url = n.getChild("URL");
    const marks = n.getChildren("LinkMark");
    const src = url ? state.sliceDoc(url.from, url.to) : "";
    const alt = marks.length >= 2 ? state.sliceDoc(marks[0].to, marks[1].from) : "";
    if (src) {
      // 视频复用图片语法，title 位携带 poster= 封面约定
      const titleNode = n.getChild("LinkTitle");
      const rawTitle = titleNode
        ? state.sliceDoc(titleNode.from, titleNode.to).replace(/^["'(]|["')]$/g, "")
        : "";
      // 磁盘文库里的相对路径（attachments/…）换成能显示的 object URL；还没读出来先留原样，
      // 附件解析好后 livePreview 会收到刷新事件重建部件（src 变了 eq 不成立）
      const shown = isAttachmentSrc(src) ? (resolveAttachmentSrc(src) ?? src) : src;
      const widget = isVideoUrl(src)
        ? new VideoWidget(shown, alt, posterFromTitle(rawTitle), editing)
        : new ImageWidget(shown, alt, editing);
      if (editing) {
        // 编辑态不藏源码，另在 node.to 后挂一份预览：图片整张消失会让版面塌一块，
        // 改地址时也看不到改成了什么。side:1 让光标停在 `)` 之后时画在预览之前（还在源码行上）。
        // 不登记 atomic —— 此刻源码要能逐字符编辑、正常插入换行
        ctx.decos.push(Decoration.widget({ widget, side: 1 }).range(node.to));
      } else {
        ctx.replaceAtomic(node.from, node.to, widget);
      }
    }
    return false; // 内部标记已整体处理
  }

  if (name === "HorizontalRule") {
    if (!caretInside(caret, node.from, node.to)) {
      ctx.replaceAtomic(node.from, node.to, new HrWidget());
    }
    return;
  }
}
