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

/** 到位后还要连看这么多帧，确认 CM 不再改主意。约 4 帧 ≈ 65ms —— 目录高亮的 pin 靠跳转
    期间不间断的滚动上报续命（useTopLine 的 PIN_QUIET_MS = 300），等太久会把它放掉 */
const SETTLE_STABLE_FRAMES = 4;
/** 指数趋近的时间常数：每帧吃掉剩余距离的 1 - e^(-dt/τ)，τ 越小收得越急 */
const SETTLE_TAU_MS = 90;
/** 单帧 dt 上限。切到后台再回来时 rAF 时间戳会跨掉几秒，夹住免得一步蹦到底 */
const SETTLE_MAX_FRAME_MS = 50;
/** 距离超过这么多屏就先瞬移过去 */
const SETTLE_FAR_SCREENS = 1.5;
/** 瞬移的落点留在目标前这么多屏，剩下的一小段再滑过去 */
const SETTLE_APPROACH_SCREENS = 0.5;
/** 位置与目标差到这以内就算到位 —— scrollTop 本来就常被浏览器取整，再抠没意义 */
const SETTLE_EPSILON_PX = 0.5;
/** 实际 scrollTop 与我们上帧写进去的值差这么多，就是别人（CM 的滚动锚定、浏览器的
    scroll anchoring）挪过位置，以实际值为准 */
const SETTLE_FOREIGN_PX = 2;
/** 再怎么收敛不了也就到此为止 */
const SETTLE_TIMEOUT_MS = 2500;

/**
 * 带收敛修正的跳转：把某行滚到容器顶端，逐帧重算落点并趋近过去。返回取消函数。
 *
 * 为什么不能一次 scrollTo 了事：CodeMirror 对视口外的行只有 height map 里的「估算高度」，
 * view.lineBlockAt(pos).top 对没渲染过的远处行只是估计值。即时渲染模式下图片、表格、
 * 公式 widget、折行都会让估算严重偏离，于是首次跳转按估算坐标滚过去、途中 CM 才真正
 * 量到这些行，目标行的真实 top 已经变了 —— 这就是「第一次点不准、第二次就准」的由来。
 *
 * 为什么不用浏览器原生 smooth：目标几乎每帧都在漂，每次改道都得重发 scrollTo，而原生
 * 缓动一被重发就从头开始加速，连着来就是一卡一卡的顿挫。这里改成自己按 rAF 驱动的指数
 * 趋近 —— 目标换了只是换个终点，速度是连续的，不会重启。
 *
 * 为什么远距离先瞬移：长距离滑过去要把途经的图片/表格/公式 widget 全渲染一遍，本身就掉帧；
 * 先瞬移到目标前半屏（保持原来的行进方向，不至于像闪现那样失去方位感），CM 立刻就能实测
 * 目标附近的高度，剩下的一小段再滑，既快又准。
 */
export function settleScrollToLine(
  view: EditorView,
  parent: HTMLElement | null,
  line: number,
  margin: number
): () => void {
  const el = parent ?? view.scrollDOM;
  // 一律 instant：缓动由下面自己算，不能再被 CSS 的 scroll-behavior 插一脚
  const write = (top: number) => el.scrollTo({ top, behavior: "instant" });
  const clamp = (top: number) =>
    Math.min(Math.max(0, el.scrollHeight - el.clientHeight), Math.max(0, top));

  let target = lineTopTarget(view, parent, line, margin).top;
  const gap = target - el.scrollTop;
  if (Math.abs(gap) > SETTLE_FAR_SCREENS * el.clientHeight) {
    write(clamp(target - Math.sign(gap) * SETTLE_APPROACH_SCREENS * el.clientHeight));
  }

  const startedAt = performance.now();
  const userEvents = ["wheel", "touchstart", "pointerdown"] as const;
  let raf = 0;
  let stable = 0;
  // scrollTop 在部分浏览器会取整，小步长写进去会被吞掉，所以位置自己用浮点记一份
  let pos = el.scrollTop;
  let written = pos;
  let lastTime = startedAt;
  let stopped = false;

  // 用户一动手就收手：再抢滚动就是跟人较劲
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    for (const type of userEvents) el.removeEventListener(type, stop);
    view.dom.removeEventListener("keydown", stop);
  };

  const tick = (now: number) => {
    if (stopped) return;
    if (!view.dom.isConnected) return stop();

    const next = lineTopTarget(view, parent, line, margin).top;
    // CM 又量过高度了，落点跟着变：到位的帧数重新数
    if (Math.abs(next - target) > SETTLE_EPSILON_PX) stable = 0;
    target = next;

    if (now - startedAt > SETTLE_TIMEOUT_MS) {
      write(target);
      return stop();
    }

    if (Math.abs(el.scrollTop - written) > SETTLE_FOREIGN_PX) pos = el.scrollTop;
    const dt = Math.min(SETTLE_MAX_FRAME_MS, Math.max(0, now - lastTime));
    lastTime = now;

    const diff = target - pos;
    if (Math.abs(diff) < SETTLE_EPSILON_PX) {
      pos = target;
      stable += 1;
    } else {
      stable = 0;
      pos += diff * (1 - Math.exp(-dt / SETTLE_TAU_MS));
    }
    written = pos;
    write(pos);

    // 到位了也别立刻收 —— CM 常常要到后一两帧才把目标附近量完
    if (stable >= SETTLE_STABLE_FRAMES) return stop();
    raf = requestAnimationFrame(tick);
  };

  for (const type of userEvents) el.addEventListener(type, stop, { passive: true });
  view.dom.addEventListener("keydown", stop);
  raf = requestAnimationFrame(tick);
  return stop;
}
