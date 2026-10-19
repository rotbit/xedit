import type { EditorView } from "@codemirror/view";

/**
 * Editor scroll coordinate conversion, position reporting, and jumps.
 *
 * The home document view puts the title area and body in one outer scroll container, so .cm-scroller no longer scrolls
 * (overflow:visible), and scroll reads/writes must target that outer container; that's the parent
 * parameter of each function below, and when null it falls back to CodeMirror's own scroll container.
 */

/** Height of the container top in document coordinates. documentTop is exactly the origin of the lineBlockAt* coordinates,
    so converting with it avoids caring about content padding and container nesting depth */
export function docTopOffset(view: EditorView, parent: HTMLElement | null): number {
  if (!parent) return view.scrollDOM.scrollTop;
  return parent.getBoundingClientRect().top - view.documentTop;
}

/**
 * Report the top line number during CodeMirror's layout-read phase; shared by the outline, scroll memory, and split-view sync.
 * Reading lineBlockAtHeight directly in a scroll event forces early measurement; requests in the same frame are merged by key,
 * read once the editor's viewport has settled, with callbacks deferred to the write phase so layout reads and UI updates don't interleave.
 */
export function reportScrollLine(
  view: EditorView,
  parent: HTMLElement | null,
  cb: (line: number, ratio: number) => void
) {
  view.requestMeasure({
    key: reportScrollLine,
    read: () => {
      const top = Math.max(0, docTopOffset(view, parent));
      const block = view.lineBlockAtHeight(top);
      const line = view.state.doc.lineAt(block.from).number - 1;
      const ratio = block.height > 0 ? Math.min(1, Math.max(0, (top - block.top) / block.height)) : 0;
      return { line, ratio };
    },
    write: ({ line, ratio }) => cb(line, ratio),
  });
}

/**
 * Precisely restore scroll position from "top line + fraction within the line" (used for per-document scroll memory).
 *
 * The only difference from scrollLineIntoView is the landing point: that one aligns the whole line to the container top (for jumps),
 * this one restores exactly the moment reportScrollLine reported; when a long paragraph or large image takes one line,
 * aligning only the line start would jump back a lot, so the fraction must be restored too. Always instant with no animation: restoring means "the page
 * was supposed to be here", and a scroll animation would make users think they bumped something.
 */
export function scrollToLineRatio(
  view: EditorView,
  parent: HTMLElement | null,
  line: number,
  ratio: number
): void {
  // The document is often shortened elsewhere after recording, so always clamp the line number to the doc range
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

/** Absolute scrollTop needed to scroll a line to the container top (with margin), plus the scroll element and the line start */
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
  // With parent, scrollTop and documentTop move in opposite directions, so their sum is independent of the current scroll position
  // and always yields the "absolute target"; stable when called repeatedly mid-scroll, unless CM remeasures heights
  const raw = parent
    ? parent.scrollTop + (view.documentTop - parent.getBoundingClientRect().top) + blockTop - margin
    : blockTop - margin;
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  return { el, top: Math.min(max, Math.max(0, raw)), pos };
}

/** Scroll a line to the container top (with margin), returning the line start */
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

/** After arriving, keep watching this many frames to confirm CM doesn't change its mind. ~4 frames ≈ 65ms; the outline highlight pin stays alive
    on uninterrupted scroll reports during the jump (useTopLine's PIN_QUIET_MS = 300), so waiting too long would release it */
const SETTLE_STABLE_FRAMES = 4;
/** Time constant of the exponential approach: each frame consumes 1 - e^(-dt/τ) of the remaining distance; smaller τ converges faster */
const SETTLE_TAU_MS = 90;
/** Per-frame dt cap. Returning from a background tab, rAF timestamps can skip several seconds; clamp so it doesn't jump straight to the end */
const SETTLE_MAX_FRAME_MS = 50;
/** Teleport first when the distance exceeds this many screens */
const SETTLE_FAR_SCREENS = 1.5;
/** Teleport lands this many screens before the target, then glides the remaining short stretch */
const SETTLE_APPROACH_SCREENS = 0.5;
/** Within this distance of the target counts as arrived; browsers often round scrollTop anyway, so finer precision is pointless */
const SETTLE_EPSILON_PX = 0.5;
/** When actual scrollTop differs from what we wrote last frame by this much, something else (CM's scroll anchoring, browser
    scroll anchoring) moved it, so trust the actual value */
const SETTLE_FOREIGN_PX = 2;
/** If it still can't converge, stop here */
const SETTLE_TIMEOUT_MS = 2500;

/**
 * Jump with convergence correction: scroll a line to the container top, recomputing the target each frame and approaching it. Returns a cancel function.
 *
 * Why a single scrollTo isn't enough: for lines outside the viewport CodeMirror only has "estimated heights" in its height map,
 * so view.lineBlockAt(pos).top for distant unrendered lines is just an estimate. In live preview, images, tables,
 * formula widgets, and wrapping skew the estimate badly, so the first jump scrolls to the estimated position, CM only actually
 * measures those lines along the way, and the target's real top has changed; that's why "the first click misses and the second hits".
 *
 * Why not native smooth scrolling: the target drifts almost every frame, and each change of course means reissuing scrollTo, while native
 * easing restarts acceleration on each reissue, so back-to-back calls stutter. Instead we drive an exponential approach with rAF:
 * a new target just changes the endpoint, and velocity stays continuous without restarting.
 *
 * Why teleport first over long distances: gliding far means rendering every image/table/formula widget along the way, which drops frames itself;
 * teleporting to half a screen before the target (keeping the direction of travel, so it doesn't feel like a disorienting flash) lets CM measure
 * heights near the target right away, and the short remaining glide is both fast and accurate.
 */
export function settleScrollToLine(
  view: EditorView,
  parent: HTMLElement | null,
  line: number,
  margin: number
): () => void {
  const el = parent ?? view.scrollDOM;
  // Always instant: easing is computed below, and CSS scroll-behavior mustn't interfere
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
  // Some browsers round scrollTop, swallowing small steps, so track the position ourselves as a float
  let pos = el.scrollTop;
  let written = pos;
  let lastTime = startedAt;
  let stopped = false;

  // Back off as soon as the user scrolls: fighting them for the scroll would be hostile
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
    // CM remeasured heights, so the target moved: restart the arrived-frame count
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

    // Don't stop immediately on arrival: CM often finishes measuring near the target only a frame or two later
    if (stable >= SETTLE_STABLE_FRAMES) return stop();
    raf = requestAnimationFrame(tick);
  };

  for (const type of userEvents) el.addEventListener(type, stop, { passive: true });
  view.dom.addEventListener("keydown", stop);
  raf = requestAnimationFrame(tick);
  return stop;
}
