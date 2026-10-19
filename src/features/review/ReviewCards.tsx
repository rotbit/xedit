"use client";

// Comment column to the right of the body (like Word's comment pane): each card sits at its sentence's height and they make room for each other when crowded.
// Cards and editor share one scroll container, so both sides scroll locked together without separately syncing scroll.
//
// Where heights come from: view.lineBlockAt(from).top + view.documentTop.
// Not coordsAtPos: it only works for the rendered screen, while comments span the whole doc and off-screen cards need placing too.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { AiIcon } from "@/components/AiIcon";
import type { EditorView } from "@codemirror/view";
import { ReviewCard } from "./ReviewCard";
import { layoutCards } from "./locate";
import { CARD_COL_WIDTH, CARD_GAP } from "./useReviewLayout";
import { useElapsedSeconds } from "./ReviewToolbar";
import { useReviewHover } from "./useReviewHover";
import type { ReviewApi } from "./useReview";
import type { ReviewItemView } from "./types";
import { useT } from "@/i18n/useT";

/** The summary card also takes part in the layout; give it a position that won't collide with comments */
const SUMMARY_ID = "\u0000summary";

/** If two layouts differ by less than half a pixel, treat them as unchanged and skip a pointless re-render */
function same(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.5);
}

/**
 * A comment's on-screen height (the top of the line its quote is on).
 * When the quote is no longer in the body (accepted / stale), fall back to its remembered line number so the card at least stays near its spot.
 */
function anchorY(view: EditorView, item: ReviewItemView, from: number | null): number | null {
  const doc = view.state.doc;
  const pos =
    from ?? doc.line(Math.min(doc.lines, Math.max(1, item.line + 1))).from;
  if (pos > doc.length) return null;
  return view.lineBlockAt(pos).top + view.documentTop;
}

/**
 * Summary: the column shows only the beginning (three lines); clicking expands it into a proper reading panel below the review bar.
 * Reading a hundred or two characters in a 260px card is cramped; with a fixed height, the cards below don't shift as it expands and collapses.
 */
function SummaryCard({ text, onOpen }: { text: string; onOpen: () => void }) {
  const t = useT();
  if (!text) return null;
  return (
    <button
      data-menu-trigger
      className="group block w-full cursor-pointer rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-2 text-left transition-colors hover:border-[var(--ink-faint)]"
      onClick={onOpen}
    >
      <span className="flex items-center gap-1.5 text-[11px] tracking-[0.1em] text-[var(--ink-faint)]">
        <AiIcon size={14} className="shrink-0 text-[var(--accent)]" />
        {t("总评")}
        <span className="ml-auto tracking-normal transition-colors group-hover:text-[var(--ink)]">
          {t("展开阅读")}
        </span>
      </span>
      <span className="mt-1.5 line-clamp-3 block text-[12px] leading-relaxed text-[var(--ink-soft)]">
        {text}
      </span>
    </button>
  );
}

/** Loading state: a status card saying "AI is working", with three skeleton cards below showing where comments will appear */
function Skeletons() {
  const t = useT();
  const elapsed = useElapsedSeconds(true);
  return (
    <div className="flex flex-col gap-2" role="status">
      <div className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-2.5">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink)]">
          <AiIcon size={14} className="review-breathe shrink-0 text-[var(--accent)]" />
          {t("AI 正在审稿")}
          <span className="ml-auto font-normal tabular-nums text-[var(--ink-faint)]">{t("{n} 秒", { n: elapsed })}</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-faint)]">
          {t("通读全文、逐句挑问题，一般要半分钟到一分钟。意见出来后会贴着对应的句子摆在这一栏。")}
        </p>
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-lg border border-[var(--hairline-soft)] px-2.5 py-2"
          style={{ opacity: 1 - i * 0.25 }}
        >
          <div className="review-shimmer h-2 w-10 rounded" />
          <div className="review-shimmer mt-2 h-2 w-full rounded" />
          <div className="review-shimmer mt-1.5 h-2 w-2/3 rounded" />
        </div>
      ))}
    </div>
  );
}

const emptyBox =
  "rounded-lg border border-dashed border-[var(--hairline)] px-3 py-4 text-[12px] leading-relaxed text-[var(--ink-faint)]";

export function ReviewCards({
  api,
  width = CARD_COL_WIDTH,
  onOpenSettings,
  onOpenSummary,
}: {
  api: ReviewApi;
  width?: number;
  /** The "try another review type" action on error: opens the settings panel on the review bar */
  onOpenSettings: () => void;
  /** Clicking the summary card: opens the reading panel below the review bar */
  onOpenSummary: () => void;
}) {
  const t = useT();
  const { phase, cards, activeId, spanOf, editorView, tick } = api;
  const catOf = useMemo(() => new Map(api.categories.map((c) => [c.id, c])), [api.categories]);

  const colRef = useRef<HTMLElement>(null);
  const elsRef = useRef(new Map<string, HTMLElement>());
  const [tops, setTops] = useState<number[]>([]);
  /** Whether cards have been placed: unplaced cards aren't drawn (they'd all be at top:0, a stacked pile) */
  const laid = tops.length > 0;
  /** Whether top may transition: the first placement is instant, only later moves slide */
  const [flow, setFlow] = useState(false);

  /**
   * Measure heights → compute layout → place. Must finish before paint (useLayoutEffect),
   * otherwise you'd first see a pile of cards at the top that then springs apart.
   */
  useLayoutEffect(() => {
    const col = colRef.current;
    const view = editorView();
    if (!col || !view || phase !== "done") {
      // A new run (rerun / error / still loading) invalidates placement: a new batch of cards shouldn't start from the previous batch's positions,
      // or the first frame paints at the old positions and then slides over in front of the user
      setTops((prev) => (prev.length === 0 ? prev : []));
      setFlow(false);
      return;
    }
    const base = col.getBoundingClientRect().top;

    const anchors = [0]; // Summary sticks to the top of the column
    const heights = [elsRef.current.get(SUMMARY_ID)?.offsetHeight ?? 0];
    let last = 0;
    for (const item of cards) {
      heights.push(elsRef.current.get(item.id)?.offsetHeight ?? 0);
      const y = anchorY(view, item, spanOf(item.id)?.from ?? null);
      // If it can't be measured, follow the previous card so at least the order is right
      last = y === null ? last : y - base;
      anchors.push(last);
    }

    const at = activeId ? cards.findIndex((c) => c.id === activeId) : -1;
    const next = layoutCards(anchors, heights, at === -1 ? -1 : at + 1, CARD_GAP);
    setTops((prev) => (same(prev, next) ? prev : next));
  }, [cards, activeId, tick, spanOf, editorView, phase]);

  /**
   * Only enable transitions once placement has settled and this frame has painted.
   * Can't enable it in the same frame that sets top: the browser compares against the post-change styles,
   * so it would still slide down from 0; that's where the "pile of cards scattering" in the first second of review came from.
   */
  useEffect(() => {
    if (!laid || flow) return;
    const id = requestAnimationFrame(() => setFlow(true));
    return () => cancelAnimationFrame(id);
  }, [laid, flow]);

  if (phase === "loading") {
    return (
      <aside className="absolute right-0 top-0" style={{ width }}>
        <Skeletons />
      </aside>
    );
  }
  if (phase === "error") {
    return (
      <aside className="absolute right-0 top-0" style={{ width }}>
        {/* An error must not be a dead end: show the server's message as-is (not logged in, provider not configured, quota used up each have their own wording),
            then offer a way to change settings and a retry button */}
        <div className={emptyBox}>
          {api.error ? t(api.error) : t("审核失败")}
          <div className="mt-2 flex items-center gap-3">
            <button
              data-menu-trigger
              className="flex cursor-pointer items-center gap-1 text-[var(--accent)] hover:underline"
              onClick={onOpenSettings}
            >
              <Settings2 size={12} />
              {t("换个审核类型")}
            </button>
            <button
              className="flex cursor-pointer items-center gap-1 text-[var(--ink-soft)] hover:underline"
              onClick={api.rerun}
            >
              <RefreshCw size={12} />
              {t("重试")}
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside ref={colRef} className="absolute right-0 top-0" style={{ width }}>
      {/* Summary and comment cards are absolutely positioned; positions come from the layout algorithm above */}
      <div
        ref={(el) => {
          if (el) elsRef.current.set(SUMMARY_ID, el);
          else elsRef.current.delete(SUMMARY_ID);
        }}
        className={`absolute left-0 w-full ${flow ? "transition-[top] duration-150 ease-out" : ""}`}
        style={{ top: tops[0] ?? 0, visibility: laid ? undefined : "hidden" }}
      >
        <SummaryCard text={api.summary} onOpen={onOpenSummary} />
        {api.total === 0 ? (
          <p className={`mt-2 ${emptyBox}`}>{t("没发现需要改的地方，这篇可以直接发。")}</p>
        ) : cards.length === 0 ? (
          <p className={`mt-2 ${emptyBox}`}>{t("这一类的意见都处理完了。")}</p>
        ) : null}
      </div>

      {cards.map((item, i) => (
        <div
          key={item.id}
          ref={(el) => {
            if (el) elsRef.current.set(item.id, el);
            else elsRef.current.delete(item.id);
          }}
          className={`absolute left-0 w-full ${flow ? "transition-[top] duration-150 ease-out" : ""}`}
          style={{ top: tops[i + 1] ?? 0, visibility: laid ? undefined : "hidden" }}
        >
          <ReviewCard
            item={item}
            category={catOf.get(item.category)}
            active={item.id === activeId}
            onActivate={() => api.activate(item.id)}
            onAccept={() => api.accept(item.id)}
            onIgnore={() => api.ignore(item.id)}
            onAck={() => api.ack(item.id)}
          />
        </div>
      ))}
    </aside>
  );
}

/**
 * A card that floats up under the sentence: shows whichever comment the mouse is resting on;
 * when the comment column doesn't fit (pinActive), it also falls back to showing the selected one.
 * Positioned with coordsAtPos (only this one needs placing, and it's always in the viewport),
 * relative to its offsetParent (the layer shared by the body and the comment column, `relative` in review mode).
 */
export function ReviewPopover({ api, pinActive }: { api: ReviewApi; pinActive: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const { spanOf, editorView, tick, clearActive } = api;
  const hover = useReviewHover(editorView());
  const dismissHover = hover.dismiss;
  const shownId = hover.hoverId ?? (pinActive ? api.activeId : null);
  const item = api.cards.find((c) => c.id === shownId);

  const itemId = item?.id;
  const itemLine = item?.line;
  const catOf = useMemo(() => new Map(api.categories.map((c) => [c.id, c])), [api.categories]);

  useLayoutEffect(() => {
    const parent = ref.current?.offsetParent as HTMLElement | null;
    const view = editorView();
    if (!parent || !view || !itemId || itemLine === undefined) return;
    const span = spanOf(itemId);
    const doc = view.state.doc;
    const pick = span?.from ?? doc.line(Math.min(doc.lines, Math.max(1, itemLine + 1))).from;
    const at = view.coordsAtPos(Math.min(pick, doc.length));
    const box = parent.getBoundingClientRect();
    const next = at
      ? {
          top: at.bottom - box.top + 6,
          left: Math.max(0, Math.min(at.left - box.left, box.width - CARD_COL_WIDTH)),
        }
      : null;
    if (!next) return;
    // Don't setState if the position didn't change: this effect may run every render and would otherwise wake itself up
    setPos((prev) =>
      prev && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.left - next.left) < 0.5
        ? prev
        : next
    );
  }, [itemId, itemLine, tick, spanOf, editorView]);

  /** Collapse on clicking elsewhere (clicking another mark doesn't count; that means switching to view another) */
  const onOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || ref.current?.contains(target)) return;
      if (target.closest?.("[data-review-id]")) return;
      dismissHover();
      if (pinActive) clearActive();
    },
    [clearActive, dismissHover, pinActive]
  );
  useEffect(() => {
    if (!itemId) return;
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [itemId, onOutside]);

  if (!item) return null;
  return (
    <div
      ref={ref}
      className="float-pop absolute z-20 rounded-lg"
      onMouseEnter={hover.hold}
      onMouseLeave={hover.release}
      style={{
        width: CARD_COL_WIDTH,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        opacity: pos ? 1 : 0,
      }}
    >
      <ReviewCard
        item={item}
        category={catOf.get(item.category)}
        active
        onActivate={() => {}}
        onAccept={() => {
          api.accept(item.id);
          hover.dismiss();
        }}
        onIgnore={() => {
          api.ignore(item.id);
          hover.dismiss();
        }}
        onAck={() => {
          api.ack(item.id);
          hover.dismiss();
        }}
      />
    </div>
  );
}
