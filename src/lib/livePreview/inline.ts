import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { Decoration } from "@codemirror/view";
import { isAttachmentSrc, resolveAttachmentSrc } from "@/lib/localBackend/attachmentUrls";
import { isVideoUrl, posterFromTitle } from "@/lib/media";
import { HrWidget, ImageWidget, VideoWidget } from "@/lib/livePreview/widgets";
import { footnoteRef } from "@/lib/livePreview/footnote";
import { caretTouches, type LpContext } from "@/lib/livePreview/context";
import { COLOR_SPAN_OPEN_EXACT } from "@/lib/editor/colorSpan";

/**
 * 行内语法的即时渲染分支（强调、行内代码、删除线、链接、颜色 span、图片/视频、分割线）。
 * 从 livePreview/index.ts 里抽出来只为控制单文件长度，判定规则一以贯之：
 * 光标进入该语法范围内才显示标记，位移只发生在焦点处。
 * 链接的点击语义（协议白名单、⌘/Ctrl+点击打开）也放这里 —— 生成 data-lp-href 的是本文件，
 * 让「什么样的地址可点」和「点了怎么办」待在一处，改一边不会漏掉另一边。
 */

/**
 * 光标进入行内语法时现出的标记（**、*、~~、`）。
 * 直接现出原文会把同行文字向右推出一大截，看着像整行在抖；缩到 0.75em 再挤掉字距，
 * 占位只剩原来的一半多一点，抖动幅度随之减半。line-height 是无单位继承值，
 * 会跟着这里的字号一起缩小，所以行高不受影响、不会引起竖向跳动。
 */
const INLINE_MARK = Decoration.mark({ class: "cm-lp-mark-inline" });

/** Mac 上 Ctrl+点击等同右键（会弹上下文菜单），打开链接只认 ⌘；其余平台只认 Ctrl。
    模块级算一次就够：装饰每次重建都要拼提示串，点击每次都要判修饰键 */
const IS_MAC = typeof navigator === "undefined" || /Mac|iPhone|iPad/i.test(navigator.userAgent);
const OPEN_HINT = IS_MAC ? "⌘ + 点击打开" : "Ctrl + 点击打开";

/** 允许交给 window.open 的协议：其余（javascript:、data:、vbscript: …）点一下就是在
    自己的页面里跑别人写的代码，而文档内容可能来自导入/分享/协作，必须挡在渲染这一层——
    过不了这关的链接连 data-lp-href 都不挂，既打不开也不给指针样式，看着就不是能点的东西 */
const SAFE_SCHEME = /^(?:https?|mailto|tel):/i;

/** 通过则返回可安全打开的地址，挡下的返回 null。无协议的相对路径/锚点一律放行 */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return SAFE_SCHEME.test(href) ? href : null;
  return href;
}

/** 渲染态链接的点击目标：外链给 href，[[双向链接]] 给 wiki 标题 */
export interface LinkTarget {
  readonly href?: string;
  readonly wiki?: string;
}

/**
 * ⌘/Ctrl+点击落在渲染出来的链接上时取出跳转目标，其余情况一律返回 null。
 * 单击＝定位光标（交回 CodeMirror 默认行为，随即现出源码可编辑），⌘/Ctrl+点击＝打开，
 * 与 Obsidian/Typora 一致：渲染后的链接文字首先是正文，点它多半是想在那儿落笔改字。
 */
export function linkTargetAt(e: MouseEvent): LinkTarget | null {
  if (e.button !== 0 || !(IS_MAC ? e.metaKey : e.ctrlKey)) return null;
  const dom = e.target as HTMLElement | null;
  const raw = dom?.closest?.("[data-lp-href]")?.getAttribute("data-lp-href");
  if (raw) {
    // 装饰属性是 DOM 里的一串字符，渲染时虽已过滤，打开前仍再验一次
    const href = safeHref(raw);
    return href ? { href } : null;
  }
  const wiki = dom?.closest?.("[data-lp-wiki]")?.getAttribute("data-lp-wiki");
  return wiki ? { wiki } : null;
}

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
    // lezer 不认脚注，`[^id]` 会被解析成一个没有 URL 的链接。交给脚注分支处理并就此收手：
    // 两边都装饰会在同一段上叠出两条 replace，CodeMirror 直接抛错
    if (footnoteRef(ctx, n)) return false;
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
    // 链接文字提示 URL，⌘/Ctrl+点击打开；单击照常定位光标（随即现出源码可编辑）——
    // 与 Obsidian/Typora 一致：链接文字首先是正文，点它多半是想在那儿落笔改字
    const href = url ? safeHref(state.sliceDoc(url.from, url.to)) : null;
    if (href && marks.length >= 2 && marks[1].from > marks[0].to) {
      ctx.decos.push(
        Decoration.mark({
          class: "cm-lp-link",
          attributes: { "data-lp-href": href, title: `${href}\n${OPEN_HINT}` },
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
    const href = safeHref(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (!href) return;
    ctx.decos.push(
      Decoration.mark({
        class: "cm-lp-link",
        attributes: { "data-lp-href": href, title: OPEN_HINT },
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
            // 与外链同一套规矩：单击落笔改字，⌘/Ctrl+点击才跳转
            title: `「${target}」\n${OPEN_HINT}`,
          },
        }).range(textFrom, textTo)
      );
    }
    return false;
  }

  if (name === "Image") {
    // 图片/视频的还原判定含边界（caretTouches）：点击部件把光标送到 from+2，
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
    // 与图片同一档的含边界判定：光标一碰到 `---` 两端就现出源码。
    // 用严格内部判定时，光标停在 `---` 的首/尾（点开部件后按 Home、或从下一行按 ← 上来）
    // 会当场翻回分割线，在这一行里挪光标就成了来回闪。
    // 顺带把「一次退格抹掉整条线」也解决了：atomicRanges 只登记此刻真被替换的区间，
    // 光标贴着 `---` 时压根不登记，删除键于是按字符走，退一次只掉一个 `-`，看得见
    if (!caretTouches(caret, node.from, node.to)) {
      ctx.replaceAtomic(node.from, node.to, new HrWidget());
    }
    return;
  }
}
