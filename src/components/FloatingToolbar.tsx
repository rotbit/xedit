"use client";

// Notion-style floating toolbar: a pill row that only appears when body text is selected, replacing the old always-on bar.
// It only holds formatting commands that "act on the selection"; insert actions (image/table/code block…) moved to the top bar's + menu.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bold, Italic, Strikethrough, Quote, Code, Link2 } from "lucide-react";
import { ColorPicker } from "./ColorPicker";
import { tk } from "@/i18n/t";
import { useT } from "@/i18n/useT";
import type { EditorHandle, SelectionInfo } from "@/lib/editor/types";
import type { FormatCommand } from "@/lib/editor/commands";

const ICON = 16;

/** Pill height (matches CSS h-9); fallback when the element can't be measured */
const BAR_H = 36;
/** Breathing room between the toolbar and the selection */
const GAP = 8;
/** Flip below when the selection is too close to the scroll container's top, so the toolbar doesn't cover UI above or go off-screen */
const FLIP_TOP = 56;
/** How long the selection must stay stable before appearing: reset continuously while drag-selecting, shown on release (or once keyboard selection ends) */
const SHOW_DELAY = 80;
/** Fade-out duration, matching CSS float-toolbar-out */
const HIDE_MS = 80;

/** Heading buttons skip lucide's H₁/H₂/H₃ (cramped subscripts, hard to read) in favor of plain literal "H1/H2/H3" */
function HeadingGlyph({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="flex items-baseline font-semibold leading-none tracking-tight [font-family:var(--sans)]">
      <span className="text-[13px]">H</span>
      <span className="text-[9.5px]">{level}</span>
    </span>
  );
}

type Btn = { cmd: FormatCommand; icon: React.ReactNode; label: string };

/** Order: bold · italic · strikethrough · font color | H1 · H2 · H3 | quote · inline code · link */
const GROUP_A: Btn[] = [
  { cmd: "bold", icon: <Bold size={ICON} />, label: tk("加粗（⌘B）") },
  { cmd: "italic", icon: <Italic size={ICON} />, label: tk("斜体（⌘I）") },
  { cmd: "strike", icon: <Strikethrough size={ICON} />, label: tk("删除线") },
];
const GROUP_B: Btn[] = [
  { cmd: "h1", icon: <HeadingGlyph level={1} />, label: tk("一级标题") },
  { cmd: "h2", icon: <HeadingGlyph level={2} />, label: tk("二级标题") },
  { cmd: "h3", icon: <HeadingGlyph level={3} />, label: tk("三级标题") },
];
const GROUP_C: Btn[] = [
  { cmd: "quote", icon: <Quote size={ICON} />, label: tk("引用") },
  { cmd: "code", icon: <Code size={ICON} />, label: tk("行内代码") },
  { cmd: "link", icon: <Link2 size={ICON} />, label: tk("链接（⌘K）") },
];

const btnCls =
  "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] transition-colors duration-100 hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] active:scale-90";

const Divider = () => <span className="mx-1 h-4 w-px shrink-0 rounded bg-[var(--hairline)]" />;

export function FloatingToolbar({
  subscribe,
  editorRef,
  scrollEl,
  onCommand,
}: {
  /** Subscribe to the editor's selection stream: subscription instead of props, so moving the cursor doesn't re-render the whole article view */
  subscribe: (cb: (info: SelectionInfo | null) => void) => () => void;
  editorRef: React.RefObject<EditorHandle | null>;
  /** The editor's scroll container: recompute on scroll, and use its top edge to decide whether to flip below the selection */
  scrollEl: HTMLElement | null;
  onCommand: (cmd: FormatCommand, arg?: string) => void;
}) {
  // Delayed unmount: mounted controls DOM presence, closing covers the 80ms fade-out
  const [mounted, setMounted] = useState(false);
  const t = useT();
  const [closing, setClosing] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  /** Logically "should show" — one step ahead of mounted, already false during the fade-out */
  const visibleRef = useRef(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The editor loses focus while swatches are open (the native color picker steals it), so don't collapse the toolbar then
  const holdRef = useRef(false);
  // Edits initiated by the toolbar itself: dispatch is synchronous, so the flag only holds for this one call
  const selfEditRef = useRef(false);
  // After Esc closes it, remember that selection; if it hasn't changed, don't pop back up automatically
  const escKeyRef = useRef<string | null>(null);
  const selKeyRef = useRef<string | null>(null);

  /** Position the pill for the current selection: anchored to the selection's starting line, horizontally centered on its midpoint when on one line */
  const place = useCallback(() => {
    const view = editorRef.current?.view();
    const el = rootRef.current;
    if (!view || !el) return;
    const sel = view.state.selection.main;
    if (sel.empty) return;
    const a = view.coordsAtPos(sel.from);
    if (!a) return;
    const b = view.coordsAtPos(sel.to);
    // Only center on the midpoint when start and end share a line; across lines hug the start so the pill doesn't drift somewhere unrelated
    const sameLine = !!b && Math.abs(b.top - a.top) < 1;
    const anchorX = sameLine ? (a.left + b.right) / 2 : a.left;

    const w = el.offsetWidth || 0;
    const h = el.offsetHeight || BAR_H;
    // Never overflow the editor column horizontally; clamp to the edge if it would
    const col = view.dom.getBoundingClientRect();
    const min = col.left + 8;
    const max = Math.max(min, col.right - w - 8);
    const left = Math.min(Math.max(anchorX - w / 2, min), max);

    const containerTop = scrollEl ? scrollEl.getBoundingClientRect().top : 0;
    const flip = a.top - containerTop < FLIP_TOP;
    const top = flip ? a.bottom + GAP : a.top - GAP - h;
    setPos({ left: Math.round(left), top: Math.round(top) });
  }, [editorRef, scrollEl]);

  const show = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    visibleRef.current = true;
    setMounted(true);
    setClosing(false);
  }, []);

  const hide = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (!visibleRef.current) return;
    visibleRef.current = false;
    setClosing(true);
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setMounted(false);
      setPos(null);
    }, HIDE_MS);
  }, []);

  /** Single entry point for the selection stream: show / hide / follow are all decided here */
  const onSelection = useCallback(
    (sel: SelectionInfo | null) => {
      // Every report resets the delay: nothing appears mid-drag, it floats in after 80ms of stability
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      if (!sel || sel.empty) return hide();
      // Typing hides it; the doc change caused by the toolbar's own command doesn't count
      if (sel.docChanged && !selfEditRef.current) return hide();
      // Hide on blur, except when focus lands on the toolbar itself (or the swatches are open)
      if (
        !sel.hasFocus &&
        !holdRef.current &&
        !rootRef.current?.contains(document.activeElement)
      ) {
        return hide();
      }
      const key = `${sel.from}:${sel.to}`;
      selKeyRef.current = key;
      if (escKeyRef.current === key) return;
      escKeyRef.current = null;
      // Already visible: just update the position, don't go through the delay again (the selection shifts after clicking a button)
      if (visibleRef.current) return place();
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        show();
      }, SHOW_DELAY);
    },
    [hide, show, place]
  );

  useEffect(() => subscribe(onSelection), [subscribe, onSelection]);

  useEffect(
    () => () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    []
  );

  // Position on the first frame: the layout effect runs before paint, so the pill never flies in from a corner
  useLayoutEffect(() => {
    if (mounted) place();
  }, [mounted, place]);

  // Follow on scroll/resize; coalesce with rAF so each scroll event doesn't trigger a measurement
  useEffect(() => {
    if (!mounted) return;
    let raf = 0;
    const onMove = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        place();
      });
    };
    scrollEl?.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      scrollEl?.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
    };
  }, [mounted, scrollEl, place]);

  // Esc hides it (capture: record the current selection before CodeMirror handles Escape)
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      escKeyRef.current = selKeyRef.current;
      hide();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mounted, hide]);

  /** Toolbar dispatches a command: CodeMirror's dispatch and updateListener run synchronously,
   *  so this pair of assignments brackets exactly the docChanged caused by the command and won't affect the user's next keystroke */
  const run = useCallback(
    (cmd: FormatCommand, arg?: string) => {
      selfEditRef.current = true;
      try {
        onCommand(cmd, arg);
      } finally {
        selfEditRef.current = false;
      }
    },
    [onCommand]
  );

  const onColorPanel = useCallback((open: boolean) => {
    holdRef.current = open;
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={rootRef}
      data-closing={closing ? "true" : undefined}
      className="float-toolbar fixed z-[70] flex h-9 items-center rounded-[10px] border border-[var(--hairline)] bg-[var(--panel)] px-1"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        // Stay hidden until positioned, to avoid flashing at (0,0) on the first frame
        visibility: pos ? "visible" : "hidden",
      }}
      // Press without stealing focus: the editor keeps focus, so the selection doesn't vanish when a button is clicked
      onMouseDown={(e) => e.preventDefault()}
    >
      {GROUP_A.map((b) => (
        <button key={b.cmd} className={btnCls} title={t(b.label)} onClick={() => run(b.cmd)}>
          {b.icon}
        </button>
      ))}
      <ColorPicker
        className={btnCls}
        onPick={(color) => run("color", color ?? undefined)}
        onOpenChange={onColorPanel}
      />
      <Divider />
      {GROUP_B.map((b) => (
        <button key={b.cmd} className={btnCls} title={t(b.label)} onClick={() => run(b.cmd)}>
          {b.icon}
        </button>
      ))}
      <Divider />
      {GROUP_C.map((b) => (
        <button key={b.cmd} className={btnCls} title={t(b.label)} onClick={() => run(b.cmd)}>
          {b.icon}
        </button>
      ))}
    </div>,
    document.body
  );
}
