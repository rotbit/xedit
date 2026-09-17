import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { texToSvg } from "@/lib/markdown/mathjax";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { caretTouches, type LpContext } from "@/lib/livePreview/context";
import { mathJaxReady, refreshWhenMathReady } from "@/lib/livePreview/mathReady";
import { editOnClick } from "@/lib/livePreview/widgetUtils";
import type { ScanGuards, ScanLine } from "@/lib/livePreview/lineScan";

/**
 * 行内公式 `$…$` 的即时渲染。
 *
 * 识别口径逐条对着 markdown/math.ts 的 mathInline 抄（导出、预览走的就是那条规则）：
 * 编辑器里认了、导出时不认，是最难查的一类“我明明看见渲染了”。对齐的细节见 scanLine。
 *
 * 渲染沿用块级公式那套异步就绪机制（mathReady.ts）：MathJax 没加载完时原文原样留着，
 * 加载完了发一次 refreshLivePreview 重建装饰——行内公式不做“加载中”占位，
 * 原文本来就在行里占着位置，换成等宽占位反而会让整行先跳一次。
 */

/** 渲染结果缓存：装饰每次重建都要把可见范围里的公式过一遍，同一条 TeX 不该反复跑 MathJax。
    失败也记（null）——语法错的公式每敲一个字都重新解析一次是纯粹的浪费 */
const svgCache = new Map<string, string | null>();
const SVG_CACHE_MAX = 200;

/** 渲染一条行内 TeX；解析失败返回 null（调用方保留源码并打上错误样式，不抛错）。
    产出的 SVG 与块级公式走同一条消毒管线（DOMPurify），之后才允许进 DOM */
function renderInlineTex(tex: string): string | null {
  const hit = svgCache.get(tex);
  if (hit !== undefined) return hit;
  let svg: string | null = null;
  try {
    svg = sanitizeHtml(texToSvg(tex, false));
  } catch {
    svg = null;
  }
  // 满了整锅倒掉（与 markdown/mathjax.ts 的缓存同思路）：长文里公式不会多到需要 LRU，
  // 而清空的代价只是下一轮重算一次
  if (svgCache.size >= SVG_CACHE_MAX) svgCache.clear();
  svgCache.set(tex, svg);
  return svg;
}

/** 把消毒过的 SVG 挂进部件。走 DOMParser 而不是 innerHTML：内容虽然已过 DOMPurify，
    但部件的 DOM 是现成的模板，少留一处赋值 HTML 的写法，以后被抄到没消毒的地方的机会也少一处。
    解析器不会执行脚本，代价与 innerHTML 相当（都是一次解析） */
function setSvg(el: HTMLElement, html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  el.append(...Array.from(parsed.body.childNodes));
}

/** 光标停在公式里时给源码垫的淡底；错误样式则是原文加一条红波浪线 */
const SRC_MARK = Decoration.mark({ class: "cm-lp-math-src" });
const BAD_MARK = Decoration.mark({ class: "cm-lp-math-src cm-lp-math-bad" });

class InlineMathWidget extends WidgetType {
  constructor(readonly tex: string) {
    super();
  }
  /** 只比 TeX 源：同一条公式在重建装饰时复用现成的 DOM，不必再摆一次 SVG。
      不像块级那样把就绪状态也比进去——没就绪时这里压根不出部件 */
  eq(other: InlineMathWidget) {
    return other.tex === this.tex;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = "cm-lp-imath";
    el.title = "点击编辑公式";
    // 建部件前已经确认渲染得出来（见 inlineMathLine），这里必然拿得到消毒过的 SVG
    setSvg(el, renderInlineTex(this.tex) ?? "");
    // +1 跳过开头的 `$`：光标落进区间内部，装饰随即让位给源码
    editOnClick(el, view, 1);
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

/** 下标 i 处的字符是否被反斜杠转义（前面连续的反斜杠为奇数个） */
function isEscaped(text: string, i: number): boolean {
  let n = 0;
  while (i - n - 1 >= 0 && text[i - n - 1] === "\\") n++;
  return n % 2 === 1;
}

export interface InlineMathRange {
  from: number;
  to: number;
  tex: string;
}

/**
 * 扫一行里的 `$…$`，坐标已换算成文档偏移。判定与 markdown/math.ts 的 mathInline 一一对应：
 * - `\$` 不算定界符（那边靠 escape 规则先吃掉，这里自己数反斜杠）；
 * - 找不到闭合 `$`：这个 `$` 当普通字符，从它后面一位接着扫；
 * - `$$` 紧挨着：空公式不成立，跳过两个字符（一行里的 `$$…$$` 因此不会被拆成两段行内公式）；
 * - 内容首尾是空白、或闭合 `$` 后面紧跟数字：一律当普通字符——
 *   `$5 和 $10` 这种价格写法正是靠这两条排除的，两边行为必须完全一致；
 * - 定界符落在代码/链接/图片/表格/$$ 块里的不算（guards 的两档见 lineScan.ts）。
 *
 * 与 markdown-it 的差异只剩一处：那边的行内解析跨整段，`$a\nb$` 这种跨行公式也能成立，
 * 这里按行扫描不认——编辑器里跨行公式会保持源码，导出仍渲染，方向上是安全的那一侧。
 */
function scanLine(line: ScanLine, guards: ScanGuards): InlineMathRange[] {
  const out: InlineMathRange[] = [];
  const { text } = line;
  let pos = 0;
  while (pos < text.length) {
    const open = text.indexOf("$", pos);
    if (open < 0) break;
    const openAt = line.from + open;
    if (
      isEscaped(text, open) ||
      guards.inBlock(openAt, openAt + 1) ||
      guards.inInline(openAt, openAt + 1)
    ) {
      pos = open + 1;
      continue;
    }
    // 往后找未被转义的闭合 `$`
    let close = -1;
    for (let i = open + 1; i < text.length; i++) {
      const hit = text.indexOf("$", i);
      if (hit < 0) break;
      if (!isEscaped(text, hit)) {
        close = hit;
        break;
      }
      i = hit;
    }
    if (close < 0) break;
    if (close === open + 1) {
      pos = open + 2;
      continue;
    }
    const closeAt = line.from + close;
    const tex = text.slice(open + 1, close);
    if (
      /^\s/.test(tex) ||
      /\s$/.test(tex) ||
      /^\d/.test(text.slice(close + 1)) ||
      guards.inBlock(closeAt, closeAt + 1) ||
      guards.inInline(closeAt, closeAt + 1)
    ) {
      pos = open + 1;
      continue;
    }
    out.push({ from: openAt, to: closeAt + 1, tex });
    pos = close + 1;
  }
  return out;
}

/**
 * 一行里的行内公式装饰。三种形态：
 * - 光标碰到（含两端边界，与图片/分割线同一档）：显示源码，垫一层淡底标明这是公式；
 * - TeX 解析不了：同样保留源码，加一条红波浪线，绝不因为一个写错的公式吞掉内容；
 * - 其余：整段 `$…$` 换成 MathJax 的行内 SVG。
 */
export function inlineMathLine(
  ctx: LpContext,
  view: EditorView,
  line: ScanLine,
  guards: ScanGuards
): void {
  for (const math of scanLine(line, guards)) {
    const { from, to } = math;
    if (caretTouches(ctx.caret, from, to)) {
      ctx.decos.push(SRC_MARK.range(from, to));
    } else if (!mathJaxReady()) {
      // 还没加载完：原文原样留着，就绪后由 refreshLivePreview 把这一轮重来一遍
      refreshWhenMathReady(view);
    } else {
      const svg = renderInlineTex(math.tex);
      if (svg) ctx.replaceAtomic(from, to, new InlineMathWidget(math.tex));
      else ctx.decos.push(BAD_MARK.range(from, to));
    }
    // 登记必须排在装饰之后：ctx 的替换装饰会避开已登记的公式区间，先登记就把自己也挡掉了。
    // 不论此刻是部件还是源码都要登记——公式里的 `*`、`[` 是 TeX 的一部分，
    // 后面那趟语法树遍历不能再把它们当成 Markdown 标记藏起来（见 context.ts）
    ctx.mathRanges.push({ from, to });
  }
}
