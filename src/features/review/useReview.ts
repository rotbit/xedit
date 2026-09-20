"use client";

/**
 * 审核模式的全部状态：跑一趟审核、算每条意见此刻的状态、两处（编辑器里的标注 / 右侧的卡片）
 * 互相带动、采纳与忽略。
 *
 * 三条自始至终的原则：
 * 1. 意见靠引文文字对位，不记任何偏移——正文随时在改，偏移当场就废；
 * 2. 能从正文里推出来的状态就别另存（见 status.ts），这样 ⌘Z 撤销之后卡片自己会活过来；
 * 3. 标注长在编辑器里（见 editorMarks.ts），审核就发生在作者正在改的那几个字上。
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
import { runReview } from "./aiReview";
import { deriveStatus, isHandled } from "./status";
import type {
  ReviewAction,
  ReviewCategory,
  ReviewItemView,
  ReviewPhase,
  ReviewResult,
} from "./types";

/** 选中一条之后，把引文滚到可视区的这个位置（0 = 顶端） */
const SCROLL_BIAS = 0.3;
/** 引文落在这个纵向区间里就算「已经看得见」，不再滚动打扰作者 */
const COMFORT_TOP = 0.08;
const COMFORT_BOTTOM = 0.78;

export interface ReviewApi {
  phase: ReviewPhase;
  error: string | null;
  summary: string;
  categories: ReviewCategory[];
  /** 全部意见，按文中出现的顺序，带此刻的状态 */
  items: ReviewItemView[];
  /** 卡片栏要画的那些（已忽略的不画；再过一道分类筛选） */
  cards: ReviewItemView[];
  /** 各分类下还待处理的条数（筛选胶囊上的数字） */
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
  accept: (id: string) => void;
  ignore: (id: string) => void;
  ack: (id: string) => void;
  /** 某条意见此刻在源码里的区间（已采纳 / 已失效的没有），卡片按它对位 */
  spanOf: (id: string) => SourceSpan | null;
  /** 当前编辑器实例：卡片要量行高，得自己问 CodeMirror */
  editorView: () => EditorView | null;
  /** 位置该重算了的信号（编辑器改了、折行了、视口推进了都会变） */
  tick: number;
}

export function useReview({
  active,
  content,
  docKey,
  editorRef,
  scrollEl,
}: {
  /** 审核模式开着没有 */
  active: boolean;
  /** 当前正文（store 里那份，已节流）：状态就是从它推出来的 */
  content: string;
  /** 换文档就把结果作废重跑 */
  docKey: string;
  editorRef: RefObject<EditorHandle | null>;
  /** 标题 + 正文的共同滚动容器：选中一条时滚的是它 */
  scrollEl: HTMLElement | null;
}): ReviewApi {
  const [phase, setPhase] = useState<ReviewPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  /** 用户按过的按钮：只记「忽略 / 知道了」，采纳从正文里推 */
  const [actions, setActions] = useState<Record<string, ReviewAction>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [runToken, setRunToken] = useState(0);
  const [tick, setTick] = useState(0);

  // 取最新值而不进依赖：正文每敲一下都变，不能让它把审核重跑一遍
  // （同步放在 effect 里：渲染期写 ref 被 react-hooks/refs 禁掉；它排在下面那些 effect 前面）
  const contentRef = useRef(content);
  const activeRef = useRef(active);
  useEffect(() => {
    contentRef.current = content;
    activeRef.current = active;
  }, [content, active]);

  /** 跑一趟审核。进入审核模式、换文档、点「重新审核」各触发一次 */
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // 真模型那条路要几十秒：退出审核、换文档、重跑都得能把上一趟掐断，
    // 否则旧结果会盖在新文档上，用户也白等一次额度
    const abort = new AbortController();
    // effect 里不能同步 setState（react-hooks/set-state-in-effect），推到微任务
    const started = Promise.resolve().then(() => {
      if (cancelled) return null;
      setPhase("loading");
      setError(null);
      setResult(null);
      setActions({});
      setActiveId(null);
      setFilter(null);
      return runReview(contentRef.current, abort.signal);
    });
    started
      .then((r) => {
        if (!r) return;
        if (cancelled) return;
        setResult(r);
        setPhase("done");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "审核失败");
        setPhase("error");
      });
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [active, docKey, runToken]);

  const rerun = useCallback(() => setRunToken((t) => t + 1), []);

  // —— 每条意见此刻算什么状态：从正文现推 ——
  const items = useMemo<ReviewItemView[]>(() => {
    if (!result) return [];
    return result.items.map((it) => ({ ...it, status: deriveStatus(it, content, actions[it.id]) }));
  }, [result, content, actions]);
  // 只在事件回调里读，放 effect 里同步就够
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const matchFilter = useCallback(
    (it: ReviewItemView) => !filter || it.category === filter,
    [filter]
  );
  /** 卡片栏：忽略掉的连卡片一起消失（计数里还留着） */
  const cards = useMemo(
    () => items.filter((it) => it.status !== "ignored" && matchFilter(it)),
    [items, matchFilter]
  );
  /** 上一条 / 下一条只在「还待处理且没被筛掉」的里面走 */
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

  // —— 编辑器里的标注 ——

  const editorView = useCallback(() => editorRef.current?.view() ?? null, [editorRef]);
  /** 每条意见此刻在源码里的位置，卡片按它对位（没有 = 采纳过或已失效） */
  const spansRef = useRef(new Map<string, SourceSpan>());
  const spanOf = useCallback((id: string) => spansRef.current.get(id) ?? null, []);

  /** 位置该重算了：合到一帧里，别让编辑器每量一次高度就叫醒一次 React */
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
   * 重新对位 + 把这一套标注交给编辑器。
   *
   * 输入法打字途中不动它：正在合成的那几个字底下重画装饰，有些平台会把合成打断。
   * 反正装饰本身会跟着文档变化自己挪位置，等这次合成落定，下一次正文变化会补上。
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
      if (it.status !== "open") continue;
      const span = locateInSource(doc, it.quote, it.line);
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
  }, [active, items, activeId, docKey, editorRef, bump]);

  // —— 联动：选中一条，标注与卡片一起走过去 ——

  /**
   * 把引文滚进可视区。看得见就不动——作者刚读到这儿，没必要因为点了张卡片就把版面抖一下。
   *
   * 不改选区：编辑器一有非空选区，浮动格式工具条就会浮出来盖在正文上（见 FloatingToolbar），
   * 每选中一条意见都弹一次实在碍事。定位感由标注的选中态给，够了。
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

  /** 点正文里的标注就选中那条意见：装饰上带着 data-review-id，在内容层上做一次委托即可 */
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

  // 上一条 / 下一条：只在待处理且没被筛掉的里面走，到头就停（不绕回）
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

  // Alt+↓ / Alt+↑ 走下一条 / 上一条（⌥ 不跟编辑器的行内快捷键撞）；Esc 取消选中
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

  // —— 采纳 / 忽略 / 知道了 ——

  /**
   * 采纳：一次事务把引文换成建议，于是 ⌘Z 一下就整条退回去，
   * 状态也跟着从正文里重新推出来（不必另记一笔「已采纳」）。
   */
  const accept = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((it) => it.id === id);
      if (!item?.suggestion) return;
      const view = editorRef.current?.view();
      if (!view) return;
      const span = locateInSource(view.state.doc.toString(), item.quote, item.line);
      if (!span) return; // 正文已经变了，这条本来就失效了
      view.dispatch({ changes: { from: span.from, to: span.to, insert: item.suggestion } });
      // 编辑器的 onChange 有 120ms 节流，这里催一把，卡片立刻变成「已采纳」
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
    setFilter,
    activeId,
    activate,
    clearActive,
    goPrev,
    goNext,
    canPrev,
    canNext,
    rerun,
    accept,
    ignore,
    ack,
    spanOf,
    editorView,
    tick,
  };
}
