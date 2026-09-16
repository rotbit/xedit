"use client";

// Notion 式浮动工具条：选中正文才浮出的一行胶囊，取代原来的常驻横栏。
// 只放「对选区生效」的格式化命令；插入类（图片/表格/代码块…）挪到顶栏的 + 菜单。

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bold, Italic, Strikethrough, Quote, Code, Link2 } from "lucide-react";
import { ColorPicker } from "./ColorPicker";
import type { EditorHandle, SelectionInfo } from "@/lib/editor/types";
import type { FormatCommand } from "@/lib/editor/commands";

const ICON = 16;
const STROKE = 1.75;

/** 胶囊高度（与 CSS 的 h-9 一致），量不到元素时兜底用 */
const BAR_H = 36;
/** 工具条与选区之间的呼吸位 */
const GAP = 8;
/** 选区离滚动容器顶部太近时翻到下方，免得工具条盖住上方 UI 或出屏 */
const FLIP_TOP = 56;
/** 选区稳定多久才浮出：拖选途中一直重置，松手（或键盘选完）才出现 */
const SHOW_DELAY = 80;
/** 淡出时长，与 CSS 的 float-toolbar-out 对齐 */
const HIDE_MS = 80;

/** 标题按钮不用 lucide 的 H₁/H₂/H₃（下标拥挤、辨识度差），改用清晰的字面「H1/H2/H3」 */
function HeadingGlyph({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="flex items-baseline font-semibold leading-none tracking-tight [font-family:var(--sans)]">
      <span className="text-[13px]">H</span>
      <span className="text-[9.5px]">{level}</span>
    </span>
  );
}

type Btn = { cmd: FormatCommand; icon: React.ReactNode; label: string };

/** 顺序：加粗 · 斜体 · 删除线 · 字体颜色 ｜ H1 · H2 · H3 ｜ 引用 · 行内代码 · 链接 */
const GROUP_A: Btn[] = [
  { cmd: "bold", icon: <Bold size={ICON} strokeWidth={STROKE} />, label: "加粗（⌘B）" },
  { cmd: "italic", icon: <Italic size={ICON} strokeWidth={STROKE} />, label: "斜体（⌘I）" },
  { cmd: "strike", icon: <Strikethrough size={ICON} strokeWidth={STROKE} />, label: "删除线" },
];
const GROUP_B: Btn[] = [
  { cmd: "h1", icon: <HeadingGlyph level={1} />, label: "一级标题" },
  { cmd: "h2", icon: <HeadingGlyph level={2} />, label: "二级标题" },
  { cmd: "h3", icon: <HeadingGlyph level={3} />, label: "三级标题" },
];
const GROUP_C: Btn[] = [
  { cmd: "quote", icon: <Quote size={ICON} strokeWidth={STROKE} />, label: "引用" },
  { cmd: "code", icon: <Code size={ICON} strokeWidth={STROKE} />, label: "行内代码" },
  { cmd: "link", icon: <Link2 size={ICON} strokeWidth={STROKE} />, label: "链接（⌘K）" },
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
  /** 订阅编辑器的选区流：走订阅而非 props，免得每次移动光标都重渲染整个文章视图 */
  subscribe: (cb: (info: SelectionInfo | null) => void) => () => void;
  editorRef: React.RefObject<EditorHandle | null>;
  /** 编辑区的滚动容器：滚动时跟随重算，并用它的顶缘判断要不要翻到选区下方 */
  scrollEl: HTMLElement | null;
  onCommand: (cmd: FormatCommand, arg?: string) => void;
}) {
  // 延迟卸载：mounted 负责在不在 DOM 里，closing 负责淡出这 80ms
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  /** 逻辑上「该显示」——比 mounted 早一步，淡出期间已经是 false */
  const visibleRef = useRef(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 色板展开期间编辑器会失焦（原生取色器抢焦点），此时别把工具条收掉
  const holdRef = useRef(false);
  // 工具条自己发起的编辑：dispatch 是同步的，标记只在这一次调用内有效
  const selfEditRef = useRef(false);
  // Esc 收起后记住当时的选区，选区没变就不再自动弹回来
  const escKeyRef = useRef<string | null>(null);
  const selKeyRef = useRef<string | null>(null);

  /** 按当前选区把胶囊摆到位：锚在选区起点行，同行时水平居中于选区中点 */
  const place = useCallback(() => {
    const view = editorRef.current?.view();
    const el = rootRef.current;
    if (!view || !el) return;
    const sel = view.state.selection.main;
    if (sel.empty) return;
    const a = view.coordsAtPos(sel.from);
    if (!a) return;
    const b = view.coordsAtPos(sel.to);
    // 起止在同一行才按中点居中；跨行时贴起点，免得胶囊飘到毫不相干的横向位置
    const sameLine = !!b && Math.abs(b.top - a.top) < 1;
    const anchorX = sameLine ? (a.left + b.right) / 2 : a.left;

    const w = el.offsetWidth || 0;
    const h = el.offsetHeight || BAR_H;
    // 横向不许溢出编辑列，超了就贴边
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

  /** 选区流的唯一入口：出现 / 隐藏 / 跟随都在这里裁决 */
  const onSelection = useCallback(
    (sel: SelectionInfo | null) => {
      // 每来一次上报都重置延迟：拖选途中一直不出现，稳定 80ms 才浮出
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      if (!sel || sel.empty) return hide();
      // 打字要收起；工具条自己刚发的命令引发的那次文档变化不算
      if (sel.docChanged && !selfEditRef.current) return hide();
      // 失焦收起：焦点落在工具条自身（或色板开着）时除外
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
      // 已经显示了就只更新落点，别再走一遍延迟（点按钮后选区会移位）
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

  // 首帧就摆好：布局副作用在绘制前跑完，不会看到胶囊从角落飞过来
  useLayoutEffect(() => {
    if (mounted) place();
  }, [mounted, place]);

  // 滚动/改窗口尺寸时跟随；rAF 合帧，别让 scroll 每个事件都触发一次量算
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

  // Esc 收起（capture：抢在 CodeMirror 的 Escape 之前记下当前选区）
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

  /** 工具条发命令：CodeMirror 的 dispatch 与 updateListener 同步执行，
   *  所以这一对赋值刚好圈住命令引发的那次 docChanged，不会误伤用户的下一次击键 */
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
        // 量到落点之前先藏着，避免第一帧闪在 (0,0)
        visibility: pos ? "visible" : "hidden",
      }}
      // 按下不夺焦：编辑器保持焦点，选区不会因为点按钮而消失
      onMouseDown={(e) => e.preventDefault()}
    >
      {GROUP_A.map((b) => (
        <button key={b.cmd} className={btnCls} title={b.label} onClick={() => run(b.cmd)}>
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
        <button key={b.cmd} className={btnCls} title={b.label} onClick={() => run(b.cmd)}>
          {b.icon}
        </button>
      ))}
      <Divider />
      {GROUP_C.map((b) => (
        <button key={b.cmd} className={btnCls} title={b.label} onClick={() => run(b.cmd)}>
          {b.icon}
        </button>
      ))}
    </div>,
    document.body
  );
}
