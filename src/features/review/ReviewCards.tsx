"use client";

// 正文右侧的意见栏（Word 批注栏那套）：每张卡片贴着自己那句话的高度站，站不下就互相让。
// 卡片和编辑器同在一个滚动容器里，所以滚动时两边是焊死的，不必另外跟一遍滚动。
//
// 高度从哪来：view.lineBlockAt(from).top + view.documentTop。
// 不用 coordsAtPos —— 它只对渲染出来的那一屏有效，而意见摊在全篇，屏外的卡片同样要就位。

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Settings2, Sparkles } from "lucide-react";
import type { EditorView } from "@codemirror/view";
import { ReviewCard } from "./ReviewCard";
import { layoutCards } from "./locate";
import { CARD_COL_WIDTH, CARD_GAP } from "./useReviewLayout";
import type { ReviewApi } from "./useReview";
import type { ReviewItemView } from "./types";

/** 总评卡也参与避让排版，给它一个不会跟意见撞车的位置 */
const SUMMARY_ID = "\u0000summary";

/** 两次排版结果差不到半像素就当没变，省一次无谓的重渲染 */
function same(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.5);
}

/**
 * 一条意见在屏幕上的高度（引文所在那一行的顶端）。
 * 引文已经不在正文里（采纳过 / 已失效）时退到它记着的行号，卡片至少还站在原处附近。
 */
function anchorY(view: EditorView, item: ReviewItemView, from: number | null): number | null {
  const doc = view.state.doc;
  const pos =
    from ?? doc.line(Math.min(doc.lines, Math.max(1, item.line + 1))).from;
  if (pos > doc.length) return null;
  return view.lineBlockAt(pos).top + view.documentTop;
}

/** 总评：一段话说全篇，默认展开，嫌占地方可以收起来（开合状态在外面存，收起后高度变了要重排） */
function SummaryCard({
  text,
  open,
  onToggle,
}: {
  text: string;
  open: boolean;
  onToggle: () => void;
}) {
  if (!text) return null;
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-2">
      <button
        className="flex w-full cursor-pointer items-center gap-1.5 text-left text-[11px] tracking-[0.1em] text-[var(--ink-faint)]"
        onClick={onToggle}
      >
        <Sparkles size={11} className="shrink-0 text-[var(--accent)]" />
        总评
        <span className="ml-auto">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>
      {open ? (
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ink-soft)]">{text}</p>
      ) : null}
    </div>
  );
}

/** 加载态：三张骨架卡，让人知道位置会摆在这儿 */
function Skeletons() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg border border-[var(--hairline-soft)] px-2.5 py-2"
        >
          <div className="h-2 w-10 rounded bg-[var(--hairline)]" />
          <div className="mt-2 h-2 w-full rounded bg-[var(--hairline)]" />
          <div className="mt-1.5 h-2 w-2/3 rounded bg-[var(--hairline)]" />
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
}: {
  api: ReviewApi;
  width?: number;
  /** 出错时那句「换个审核类型」：打开的是审核条上那张设置面板 */
  onOpenSettings: () => void;
}) {
  const { phase, cards, activeId, spanOf, editorView, tick } = api;
  const catOf = useMemo(() => new Map(api.categories.map((c) => [c.id, c])), [api.categories]);

  const colRef = useRef<HTMLElement>(null);
  const elsRef = useRef(new Map<string, HTMLElement>());
  const [tops, setTops] = useState<number[]>([]);
  /** 落过位没有：没落位的卡片不画（都堆在 top:0，画出来就是一摞） */
  const laid = tops.length > 0;
  /** 允不允许 top 走过渡：第一次落位是「瞬间就位」，之后的挪动才滑 */
  const [flow, setFlow] = useState(false);
  const [sumOpen, setSumOpen] = useState(true);

  /**
   * 量高度 → 算避让 → 落位。必须在绘制前做完（useLayoutEffect），
   * 否则会先看见一摞卡片叠在顶上再弹开。
   */
  useLayoutEffect(() => {
    const col = colRef.current;
    const view = editorView();
    if (!col || !view || phase !== "done") {
      // 换一趟（重跑 / 出错 / 还在加载）就把落位作废：新一批卡片不该接着上一批的位置站，
      // 否则第一帧先画在旧位置上，再当着用户的面滑过去
      setTops((prev) => (prev.length === 0 ? prev : []));
      setFlow(false);
      return;
    }
    const base = col.getBoundingClientRect().top;

    const anchors = [0]; // 总评贴着栏顶
    const heights = [elsRef.current.get(SUMMARY_ID)?.offsetHeight ?? 0];
    let last = 0;
    for (const item of cards) {
      heights.push(elsRef.current.get(item.id)?.offsetHeight ?? 0);
      const y = anchorY(view, item, spanOf(item.id)?.from ?? null);
      // 量不到就跟在上一张后面，至少顺序还对
      last = y === null ? last : y - base;
      anchors.push(last);
    }

    const at = activeId ? cards.findIndex((c) => c.id === activeId) : -1;
    const next = layoutCards(anchors, heights, at === -1 ? -1 : at + 1, CARD_GAP);
    setTops((prev) => (same(prev, next) ? prev : next));
    // sumOpen 在列表里：总评一收一放，下面所有卡片都得跟着挪
  }, [cards, activeId, tick, sumOpen, spanOf, editorView, phase]);

  /**
   * 落位落定、这一帧画完了，才把过渡打开。
   * 不能在给 top 的同一帧里开：浏览器比对的是改完之后的样式，
   * 那样照样会从 0 滑下来——进入审核头一秒「一摞卡片散开」就是这么来的。
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
        {/* 出错不能是条死路：服务端那句话照原样摆出来（没登录、站点没配这家、额度用完各有各的说法），
            再给一条去改设置的路和一颗重试 */}
        <div className={emptyBox}>
          {api.error ?? "审核失败"}
          <div className="mt-2 flex items-center gap-3">
            <button
              data-menu-trigger
              className="flex cursor-pointer items-center gap-1 text-[var(--accent)] hover:underline"
              onClick={onOpenSettings}
            >
              <Settings2 size={11} />
              换个审核类型
            </button>
            <button
              className="flex cursor-pointer items-center gap-1 text-[var(--ink-soft)] hover:underline"
              onClick={api.rerun}
            >
              <RefreshCw size={11} />
              重试
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside ref={colRef} className="absolute right-0 top-0" style={{ width }}>
      {/* 总评与意见卡都是绝对定位，位置由上面的避让算法给 */}
      <div
        ref={(el) => {
          if (el) elsRef.current.set(SUMMARY_ID, el);
          else elsRef.current.delete(SUMMARY_ID);
        }}
        className={`absolute left-0 w-full ${flow ? "transition-[top] duration-150 ease-out" : ""}`}
        style={{ top: tops[0] ?? 0, visibility: laid ? undefined : "hidden" }}
      >
        <SummaryCard text={api.summary} open={sumOpen} onToggle={() => setSumOpen((v) => !v)} />
        {api.total === 0 ? (
          <p className={`mt-2 ${emptyBox}`}>没发现需要改的地方，这篇可以直接发。</p>
        ) : cards.length === 0 ? (
          <p className={`mt-2 ${emptyBox}`}>这一类的意见都处理完了。</p>
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
 * 摆不下意见栏时的兜底：选中哪条，就在那句话底下浮出哪张卡片。
 * 位置用 coordsAtPos（只有选中的这一条要定位，它一定在视口里），
 * 相对自己的 offsetParent（正文与意见栏共用的那一层，审核模式下是 relative）。
 */
export function ReviewPopover({ api }: { api: ReviewApi }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const item = api.cards.find((c) => c.id === api.activeId);

  const { spanOf, editorView, tick, clearActive } = api;
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
    // 位置没变就别 setState：这个 effect 每次渲染都可能跑，不拦会自己把自己叫醒
    setPos((prev) =>
      prev && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.left - next.left) < 0.5
        ? prev
        : next
    );
  }, [itemId, itemLine, tick, spanOf, editorView]);

  /** 点到别处就收起来（点在别的标注上不算——那是要换一条看） */
  const onOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || ref.current?.contains(target)) return;
      if (target.closest?.("[data-review-id]")) return;
      clearActive();
    },
    [clearActive]
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
        onAccept={() => api.accept(item.id)}
        onIgnore={() => api.ignore(item.id)}
        onAck={() => api.ack(item.id)}
      />
    </div>
  );
}
