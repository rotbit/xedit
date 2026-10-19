"use client";

/**
 * All review-mode state: running a review, computing each comment's current status, keeping the two views (marks in the editor / cards on the right)
 * in sync, accepting and ignoring.
 *
 * Three principles throughout:
 * 1. Comments are aligned by quote text, never by stored offsets; the body is always changing, so offsets go stale immediately;
 * 2. Don't store state that can be derived from the body (see status.ts), so cards come back to life after ⌘Z undo;
 * 3. Marks live in the editor (see editorMarks.ts), so review happens right on the words the author is editing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import type { EditorHandle } from "@/lib/editor/types";
import {
  installReviewMarks,
  pushReviewMarks,
  REVIEW_ID_ATTR,
  type ReviewMark,
} from "./editorMarks";
import { locateInSource, type SourceSpan } from "./locate";
import { runReview, type ReviewRun } from "./aiReview";
import { loadReviewRecord, saveReviewActions } from "./history";
import { deriveStatus, isHandled, locateQuote } from "./status";
import { tk } from "@/i18n/t";
import type {
  ReviewAction,
  ReviewCategory,
  ReviewItemView,
  ReviewPhase,
  ReviewRecordMeta,
  ReviewResult,
} from "./types";

/** Batch 「忽略 / 知道了」 (Ignore / Got it) for this long before recording to history: clicking several in a row sends once */
const SAVE_ACTIONS_DELAY = 600;
/** After selecting a comment, scroll its quote to this position in the viewport (0 = top) */
const SCROLL_BIAS = 0.3;
/** If the quote falls within this vertical band it counts as "already visible", so don't scroll and disturb the author */
const COMFORT_TOP = 0.08;
const COMFORT_BOTTOM = 0.78;

export interface ReviewApi {
  phase: ReviewPhase;
  error: string | null;
  summary: string;
  categories: ReviewCategory[];
  /** All comments, in document order, with their current status */
  items: ReviewItemView[];
  /** Those the card column draws (ignored ones excluded; then filtered by category) */
  cards: ReviewItemView[];
  /** Pending count per category (the numbers on the filter pills) */
  counts: Map<string, number>;
  total: number;
  handled: number;
  filter: string | null;
  setFilter: (id: string | null) => void;
  activeId: string | null;
  activate: (id: string) => void;
  clearActive: () => void;
  goPrev: () => void;
  goNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  rerun: () => void;
  /** Open a past run from history: no model call, no quota spent */
  openRecord: (id: string) => void;
  /** The history record of the result currently shown (null if saving failed) */
  record: ReviewRecordMeta | null;
  /** The current result was opened from history, not freshly run */
  fromHistory: boolean;
  accept: (id: string) => void;
  ignore: (id: string) => void;
  ack: (id: string) => void;
  /** Each comment's current range in the source (none for accepted / stale ones); cards align to it */
  spanOf: (id: string) => SourceSpan | null;
  /** The current editor instance: cards measure line heights, so they have to ask CodeMirror directly */
  editorView: () => EditorView | null;
  /** Signal that positions need recomputing (changes on edits, wrapping, viewport progress) */
  tick: number;
}

export function useReview({
  active,
  content,
  docKey,
  docId,
  editorRef,
  scrollEl,
}: {
  /** Whether review mode is on */
  active: boolean;
  /** The current body (the throttled copy in the store): status is derived from it */
  content: string;
  /** Switching documents discards the result and reruns */
  docKey: string;
  /** Document id: review history is filed by it */
  docId: string;
  editorRef: RefObject<EditorHandle | null>;
  /** Shared scroll container for title + body: this is what scrolls when a comment is selected */
  scrollEl: HTMLElement | null;
}): ReviewApi {
  const [phase, setPhase] = useState<ReviewPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  /** Buttons the user pressed: only 「忽略 / 知道了」 (Ignore / Got it) are recorded; acceptance is derived from the body */
  const [actions, setActions] = useState<Record<string, ReviewAction>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  /** What this run does: empty recordId = a real run; set = open that record from history (only valid for this docId) */
  const [run, setRun] = useState<{ token: number; recordId: string | null; docId: string }>({
    token: 0,
    recordId: null,
    docId,
  });
  const [record, setRecord] = useState<ReviewRecordMeta | null>(null);
  const [fromHistory, setFromHistory] = useState(false);
  /** The actions (JSON) already recorded to history: if unchanged, no need to send again */
  const savedActionsRef = useRef("{}");
  const [tick, setTick] = useState(0);

  // Read the latest value without making it a dependency: the body changes on every keystroke and mustn't rerun the review
  // (synced inside an effect: writing a ref during render is banned by react-hooks/refs; it sits before the effects below)
  const contentRef = useRef(content);
  const activeRef = useRef(active);
  useEffect(() => {
    contentRef.current = content;
    activeRef.current = active;
  }, [content, active]);

  /** Run one review (or open one history record). Triggered by entering review mode, switching docs, clicking 「重新审核」 (Review again), or clicking a history entry */
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // A real model run takes tens of seconds: exiting review, switching docs or rerunning must all be able to abort the previous run,
    // otherwise stale results land on the new document and the user wastes a run of quota
    const abort = new AbortController();
    // Can't setState synchronously in an effect (react-hooks/set-state-in-effect); defer to a microtask
    type Loaded = ReviewRun & { actions: Record<string, ReviewAction> | null };
    const started = Promise.resolve().then((): Promise<Loaded> | null => {
      if (cancelled) return null;
      setPhase("loading");
      setError(null);
      setResult(null);
      setActions({});
      setActiveId(null);
      setFilter(null);
      setRecord(null);
      savedActionsRef.current = "{}";
      // Switched documents mid-review: the recordId in hand belongs to the previous one and mustn't be opened on this one
      const recordId = run.docId === docId ? run.recordId : null;
      setFromHistory(recordId !== null);
      return recordId
        ? loadReviewRecord(recordId, abort.signal)
        : runReview(contentRef.current, abort.signal, docId).then((r) => ({ ...r, actions: null }));
    });
    started
      .then((r) => {
        if (!r) return;
        if (cancelled) return;
        // A history record carries the 「忽略 / 知道了」 actions taken back then; a fresh run has none
        if (r.actions) {
          savedActionsRef.current = JSON.stringify(r.actions);
          setActions(r.actions);
        }
        setRecord(r.record);
        setResult(r.result);
        setPhase("done");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : tk("审核失败"));
        setPhase("error");
      });
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [active, docKey, docId, run]);

  const rerun = useCallback(
    () => setRun((r) => ({ token: r.token + 1, recordId: null, docId })),
    [docId]
  );
  const openRecord = useCallback(
    (id: string) => setRun((r) => ({ token: r.token + 1, recordId: id, docId })),
    [docId]
  );

  /**
   * Record 「忽略 / 知道了」 to this run's history so it still looks handled when reopened.
   * If recording fails, let it go: it's just memory of a few button presses, not worth interrupting the author.
   */
  const recordId = record?.id ?? null;
  useEffect(() => {
    if (!recordId) return;
    const json = JSON.stringify(actions);
    if (json === savedActionsRef.current) return;
    const timer = setTimeout(() => {
      savedActionsRef.current = json;
      saveReviewActions(recordId, actions).catch(() => {});
    }, SAVE_ACTIONS_DELAY);
    return () => clearTimeout(timer);
  }, [actions, recordId]);

  // —— Each comment's current status, derived live from the body ——
  const items = useMemo<ReviewItemView[]>(() => {
    if (!result) return [];
    return result.items.map((it) => ({ ...it, status: deriveStatus(it, content, actions[it.id]) }));
  }, [result, content, actions]);
  // Only read in event callbacks, so syncing in an effect is enough
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const matchFilter = useCallback(
    (it: ReviewItemView) => !filter || it.category === filter,
    [filter]
  );
  /** Card column: ignored ones disappear along with their cards (they still count) */
  const cards = useMemo(
    () => items.filter((it) => it.status !== "ignored" && matchFilter(it)),
    [items, matchFilter]
  );
  /** Previous / next only walk through comments that are pending and not filtered out */
  const navList = useMemo(
    () => items.filter((it) => it.status === "open" && matchFilter(it)),
    [items, matchFilter]
  );
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      if (it.status !== "open") continue;
      map.set(it.category, (map.get(it.category) ?? 0) + 1);
    }
    return map;
  }, [items]);
  const handled = useMemo(() => items.filter((it) => isHandled(it.status)).length, [items]);

  // —— Marks in the editor ——

  const editorView = useCallback(() => editorRef.current?.view() ?? null, [editorRef]);
  /** Each comment's current position in the source; cards align to it (none = accepted or stale) */
  const spansRef = useRef(new Map<string, SourceSpan>());
  const spanOf = useCallback((id: string) => spansRef.current.get(id) ?? null, []);

  /** Positions need recomputing: coalesce into one frame instead of waking React every time the editor measures a height */
  const frameRef = useRef(0);
  const bump = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      setTick((t) => t + 1);
    });
  }, []);
  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    },
    []
  );

  /**
   * Re-align + hand this set of marks to the editor.
   *
   * Leave it alone during IME composition: redrawing decorations under the characters being composed interrupts composition on some platforms.
   * The decorations move along with doc changes anyway; once composition settles, the next body change catches up.
   */
  useEffect(() => {
    const view = editorRef.current?.view();
    if (!view) return;
    if (!active) {
      spansRef.current = new Map();
      pushReviewMarks(view, []);
      return;
    }
    installReviewMarks(view, () => {
      if (activeRef.current) bump();
    });
    if (view.composing) return;

    const doc = view.state.doc.toString();
    const spans = new Map<string, SourceSpan>();
    const marks: ReviewMark[] = [];
    for (const it of items) {
      // When filtering by type, the body only keeps that type's marks too, so other colors don't get in the way
      if (it.status !== "open" || !matchFilter(it)) continue;
      const span = locateQuote(it, doc);
      if (!span) continue;
      spans.set(it.id, span);
      marks.push({
        from: span.from,
        to: span.to,
        id: it.id,
        categoryId: it.category,
        active: it.id === activeId,
      });
    }
    spansRef.current = spans;
    pushReviewMarks(view, marks);
  }, [active, items, matchFilter, activeId, docKey, editorRef, bump]);

  // —— Linking: selecting a comment moves both the mark and the card to it ——

  /**
   * Scroll the quote into view. If it's already visible, don't move; the author was just reading there, no need to jolt the layout for a card click.
   *
   * Doesn't change the selection: any non-empty selection makes the floating format toolbar pop up over the body (see FloatingToolbar),
   * and having it pop up on every comment selection is a real nuisance. The mark's selected state gives enough sense of location.
   */
  const revealInEditor = useCallback(
    (item: ReviewItemView) => {
      const view = editorRef.current?.view();
      if (!view || !scrollEl) return;
      const span =
        spansRef.current.get(item.id) ??
        locateInSource(view.state.doc.toString(), item.quote, item.line);
      const pos = span
        ? span.from
        : view.state.doc.line(Math.min(view.state.doc.lines, Math.max(1, item.line + 1))).from;
      const y = view.lineBlockAt(pos).top + view.documentTop;
      const box = scrollEl.getBoundingClientRect();
      const rel = y - box.top;
      if (rel >= box.height * COMFORT_TOP && rel <= box.height * COMFORT_BOTTOM) return;
      scrollEl.scrollTo({
        top: Math.max(0, scrollEl.scrollTop + rel - box.height * SCROLL_BIAS),
        behavior: "smooth",
      });
    },
    [editorRef, scrollEl]
  );

  const activate = useCallback(
    (id: string) => {
      setActiveId(id);
      const item = itemsRef.current.find((it) => it.id === id);
      if (item) revealInEditor(item);
    },
    [revealInEditor]
  );
  const clearActive = useCallback(() => setActiveId(null), []);

  /**
   * Clicking a type pill: filter to that type and jump straight to its first occurrence in the body (by position, not result order).
   * Filtering without jumping would leave the author scrolling around hunting for those colors.
   */
  const applyFilter = useCallback(
    (next: string | null) => {
      setFilter(next);
      if (next === null) return;
      const doc = editorRef.current?.view()?.state.doc.toString() ?? "";
      const first = itemsRef.current
        .filter((it) => it.status === "open" && it.category === next)
        .map((it) => ({ id: it.id, at: locateQuote(it, doc)?.from ?? Infinity }))
        .sort((a, b) => a.at - b.at)[0];
      if (first) activate(first.id);
      else setActiveId(null);
    },
    [editorRef, activate]
  );

  /** Clicking a mark in the body selects that comment: decorations carry data-review-id, so one delegated listener on the content layer suffices */
  useEffect(() => {
    if (!active) return;
    const view = editorRef.current?.view();
    if (!view) return;
    const onClick = (e: MouseEvent) => {
      const hit = (e.target as HTMLElement | null)?.closest?.(`[${REVIEW_ID_ATTR}]`);
      const id = hit?.getAttribute(REVIEW_ID_ATTR);
      if (id) activate(id);
    };
    view.contentDOM.addEventListener("click", onClick);
    return () => view.contentDOM.removeEventListener("click", onClick);
  }, [active, docKey, editorRef, activate]);

  // Previous / next: only through pending, unfiltered comments, stopping at the ends (no wraparound)
  const navIndex = useMemo(
    () => navList.findIndex((it) => it.id === activeId),
    [navList, activeId]
  );
  const go = useCallback(
    (dir: 1 | -1) => {
      if (navList.length === 0) return;
      const next = navIndex === -1 ? (dir > 0 ? 0 : navList.length - 1) : navIndex + dir;
      if (next < 0 || next >= navList.length) return;
      activate(navList[next].id);
    },
    [navList, navIndex, activate]
  );
  const goPrev = useCallback(() => go(-1), [go]);
  const goNext = useCallback(() => go(1), [go]);
  const canPrev = navList.length > 0 && navIndex !== 0;
  const canNext = navList.length > 0 && navIndex !== navList.length - 1;

  // Alt+↓ / Alt+↑ go to next / previous (⌥ doesn't clash with the editor's inline shortcuts); Esc clears the selection
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveId((cur) => (cur === null ? cur : null));
        return;
      }
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, goNext, goPrev]);

  // —— Accept / ignore / got it ——

  /**
   * Accept: a single transaction replaces the quote with the suggestion, so one ⌘Z reverts it entirely,
   * and status is re-derived from the body accordingly (no separate "accepted" record needed).
   */
  const accept = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((it) => it.id === id);
      if (!item?.suggestion) return;
      const view = editorRef.current?.view();
      if (!view) return;
      const span = locateQuote(item, view.state.doc.toString());
      if (!span) return; // The body has changed (or it was already accepted); nothing left to accept
      view.dispatch({ changes: { from: span.from, to: span.to, insert: item.suggestion } });
      // The editor's onChange is throttled by 120ms; nudge it here so the card turns 「已采纳」 (Accepted) immediately
      editorRef.current?.flush();
    },
    [editorRef]
  );

  const mark = useCallback((id: string, action: ReviewAction) => {
    setActions((prev) => ({ ...prev, [id]: action }));
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);
  const ignore = useCallback((id: string) => mark(id, "ignored"), [mark]);
  const ack = useCallback((id: string) => mark(id, "acked"), [mark]);

  return {
    phase,
    error,
    summary: result?.summary ?? "",
    categories: result?.categories ?? [],
    items,
    cards,
    counts,
    total: items.length,
    handled,
    filter,
    setFilter: applyFilter,
    activeId,
    activate,
    clearActive,
    goPrev,
    goNext,
    canPrev,
    canNext,
    rerun,
    openRecord,
    record,
    fromHistory,
    accept,
    ignore,
    ack,
    spanOf,
    editorView,
    tick,
  };
}
