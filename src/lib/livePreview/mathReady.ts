import type { EditorView } from "@codemirror/view";
import { ensureMathJax } from "@/lib/markdown/mathjax";
import { refreshLivePreview } from "@/lib/livePreview/context";

/**
 * MathJax readiness and post-ready refresh — shared by block $$ math (blockWidgets.ts) and inline $…$
 * (inlineMath.ts).
 *
 * MathJax is loaded dynamically on demand (see markdown/mathjax.ts) and is usually not ready at first render:
 * both sides leave the source in place, and once ensureMathJax here resolves, a single refreshLivePreview is dispatched
 * to rebuild decorations. The state must be a single global: if each side tracked its own, block math could finish loading while inline still thought
 * it wasn't ready, and the same doc would show "display math rendered, inline math still source" until the next keystroke.
 */

let ready = false;
/** Wait for loading only once: if every unready formula did its own then, a doc with N formulas would trigger N full rebuilds */
let loading = false;
/** The view to refresh once ready. Always the most recent request: when switching documents the previous view is already destroyed */
let refreshTarget: EditorView | null = null;

export function mathJaxReady(): boolean {
  return ready;
}

/** Register a "refresh when ready". If already loading, just update the target view instead of triggering again. */
export function refreshWhenMathReady(view: EditorView): void {
  refreshTarget = view;
  if (loading || ready) return;
  loading = true;
  void ensureMathJax().then(() => {
    ready = true;
    loading = false;
    const target = refreshTarget;
    refreshTarget = null;
    // Wait a frame before dispatching: avoid dispatching again inside CodeMirror's update cycle
    requestAnimationFrame(() => {
      if (target?.dom.isConnected) target.dispatch({ effects: refreshLivePreview.of(null) });
    });
  });
}
