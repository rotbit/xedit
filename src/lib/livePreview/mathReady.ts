import type { EditorView } from "@codemirror/view";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { refreshLivePreview } from "@/lib/livePreview/context";

/**
 * MathJax 的就绪状态与就绪后的刷新——块级 $$ 公式（blockWidgets.ts）与行内 $…$
 * （inlineMath.ts）共用这一份。
 *
 * MathJax 是按需动态加载的（见 markdown/mathjax.ts），首屏渲染时多半还没就绪：
 * 两边都先把原文留在原地，等这里的 ensureMathJax 落地后统一发一次 refreshLivePreview
 * 把装饰重建一遍。状态必须是全局一份：两处各记各的话，块级先加载完、行内那份还以为
 * 没就绪，同一篇里就会出现「行间公式已渲染、行内公式仍是原文」直到下一次按键。
 */

let ready = false;
/** 加载只等一次：每个未就绪的公式各自 then 一次的话，一篇 N 个公式就要触发 N 次全量重建 */
let loading = false;
/** 就绪后要刷新的视图。总是记最后一个请求的：切文档时前一个 view 已经销毁 */
let refreshTarget: EditorView | null = null;

export function mathJaxReady(): boolean {
  return ready;
}

/** 登记一次「就绪后刷新」。已经在加载中就只更新目标视图，不再重复触发。 */
export function refreshWhenMathReady(view: EditorView): void {
  refreshTarget = view;
  if (loading || ready) return;
  loading = true;
  void ensureMathJax().then(() => {
    ready = true;
    loading = false;
    const target = refreshTarget;
    refreshTarget = null;
    // 等一帧再派发：避开 CodeMirror 更新周期内再次 dispatch
    requestAnimationFrame(() => {
      if (target?.dom.isConnected) target.dispatch({ effects: refreshLivePreview.of(null) });
    });
  });
}
