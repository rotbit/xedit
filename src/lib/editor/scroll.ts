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

/** 把某行滚到容器顶端（留 margin 余量）所需的绝对 scrollTop，连同滚动元素与该行起点 */
function lineTopTarget(
  view: EditorView,
  parent: HTMLElement | null,
  line: number,
  margin: number
): { el: HTMLElement; top: number; pos: number } {
  const n = Math.min(view.state.doc.lines, Math.max(1, line + 1));
  const pos = view.state.doc.line(n).from;
  const blockTop = view.lineBlockAt(pos).top;
  const el = parent ?? view.scrollDOM;
  // parent 情况下 scrollTop 与 documentTop 一增一减，两项之和与当前滚动位置无关，
  // 算出来始终是「绝对目标」；滚动途中反复调用也稳定，除非 CM 重新量了高度
  const raw = parent
    ? parent.scrollTop + (view.documentTop - parent.getBoundingClientRect().top) + blockTop - margin
    : blockTop - margin;
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  return { el, top: Math.min(max, Math.max(0, raw)), pos };
}

/** 把某行滚到容器顶端（留 margin 的余量），返回该行起点 */
export function scrollLineIntoView(
  view: EditorView,
  parent: HTMLElement | null,
  line: number,
  margin: number,
  smooth: boolean
): number {
  const { el, top, pos } = lineTopTarget(view, parent, line, margin);
  el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  return pos;
}

/** 连续这么多帧目标与位置都没动就算滚到位了。约 100ms —— 目录高亮的 pin 靠跳转期间
    不间断的滚动上报续命（useTopLine 的 PIN_QUIET_MS = 300），等太久会把它放掉 */
const SETTLE_STABLE_FRAMES = 6;
/** 平滑滚动被打断停在半路时直接补位的次数上限，防止和某些浏览器的惯性来回拉扯 */
const SETTLE_MAX_SNAPS = 3;
/** 再怎么收敛不了也就到此为止 */
const SETTLE_TIMEOUT_MS = 2500;

/**
 * 带收敛修正的跳转：把某行滚到容器顶端，滚完再核对落点，不准就改道。返回取消函数。
 *
 * 为什么不能一次 scrollTo 了事：CodeMirror 对视口外的行只有 height map 里的「估算高度」，
 * view.lineBlockAt(pos).top 对没渲染过的远处行只是估计值。即时渲染模式下图片、表格、
 * 公式 widget、折行都会让估算严重偏离，于是首次跳转按估算坐标滚过去、途中 CM 才真正
 * 量到这些行，目标行的真实 top 已经变了 —— 这就是「第一次点不准、第二次就准」的由来。
 * 这里逐帧重算目标，发现变了就重新滚，直到位置与目标都稳定下来。
 */
export function settleScrollToLine(
  view: EditorView,
  parent: HTMLElement | null,
  line: number,
  margin: number
): () => void {
  const el = parent ?? view.scrollDOM;
  let target = lineTopTarget(view, parent, line, margin).top;
  el.scrollTo({ top: target, behavior: "smooth" });

  const startedAt = performance.now();
  const userEvents = ["wheel", "touchstart", "pointerdown"] as const;
  let raf = 0;
  let stable = 0;
  let snaps = 0;
  let lastTop = el.scrollTop;
  let stopped = false;

  // 用户一动手就收手：再抢滚动就是跟人较劲
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    for (const type of userEvents) el.removeEventListener(type, stop);
    view.dom.removeEventListener("keydown", stop);
  };

  const tick = () => {
    if (stopped) return;
    if (!view.dom.isConnected || performance.now() - startedAt > SETTLE_TIMEOUT_MS) return stop();

    const next = lineTopTarget(view, parent, line, margin).top;
    if (Math.abs(next - target) > 1) {
      // CM 量过高度了，落点跟着变：改道
      target = next;
      stable = 0;
      el.scrollTo({ top: target, behavior: "smooth" });
    } else if (el.scrollTop === lastTop) {
      stable += 1;
      if (stable >= SETTLE_STABLE_FRAMES) {
        if (Math.abs(el.scrollTop - target) <= 1) return stop();
        // 目标没变、位置也不动了却没到位：平滑滚动被中途打断停在半路，直接补上去
        if (snaps >= SETTLE_MAX_SNAPS) return stop();
        snaps += 1;
        stable = 0;
        el.scrollTo({ top: target, behavior: "auto" });
      }
    } else {
      stable = 0;
    }
    lastTop = el.scrollTop;
    raf = requestAnimationFrame(tick);
  };

  for (const type of userEvents) el.addEventListener(type, stop, { passive: true });
  view.dom.addEventListener("keydown", stop);
  raf = requestAnimationFrame(tick);
  return stop;
}
