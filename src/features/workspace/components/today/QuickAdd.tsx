"use client";

/**
 * 「要做」栏顶上的快速输入：点那一行弹出小面板，写任务、挑记到哪篇。
 *
 * 默认目标是待办清单那篇——大多数时候就是随手记一件事，不该每次都要选；
 * 但有的事明确属于某篇稿子（「补第三节的数据」），直接记进那篇，回到文章里就能看到。
 * 搜不到想要的文章时可以就地新建一篇，标题就是搜索词。
 */
import { useMemo, useRef, useState } from "react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import type { TFn } from "@/i18n/t";
import { useT } from "@/i18n/useT";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { searchDocs } from "@/lib/docSearch";
import { isTemplateDoc } from "@/lib/templates";
import { findNotesDoc } from "@/lib/todos/collect";
import { NOTES_TITLE } from "@/lib/todos/write";
import type { DocMeta } from "../../types";

/** 任务记到哪：待办清单（有就追加、没有就建）/ 某篇现有文章 / 以搜索词为标题新建一篇 */
export type AddTarget = { kind: "notes" } | { kind: "doc"; id: string } | { kind: "new"; title: string };

interface Option {
  key: string;
  target: AddTarget;
  label: string;
  /** 右侧灰字：分类名，或「新建」提示 */
  hint: string;
}

const MAX_RESULTS = 8;
const RECENT_COUNT = 7;

const docOption = (doc: DocMeta, t: TFn): Option => ({
  key: doc.id,
  target: { kind: "doc", id: doc.id },
  label: doc.title || t(UNTITLED_DOC),
  hint: doc.category ?? "",
});

/**
 * 候选列表。模板分类不进候选：往模板里记待办，从模板新建的每篇稿子都会带上它，
 * 而今天页又不收模板里的待办，记进去就等于看不见。
 */
function buildOptions(docs: DocMeta[], query: string, t: TFn): Option[] {
  const pool = docs.filter((d) => !isTemplateDoc(d));
  const q = query.trim();
  if (!q) {
    const notes = findNotesDoc(pool);
    const first: Option = {
      key: "notes",
      target: { kind: "notes" },
      // 清单的标题不翻译：它是 findNotesDoc 认那篇文章的依据，新建出来就叫这个名字
      label: notes ? notes.title || NOTES_TITLE : t("{title}（新建）", { title: NOTES_TITLE }),
      hint: notes?.category ?? "",
    };
    const recent = searchDocs(
      pool.filter((d) => d.id !== notes?.id),
      "",
      { limit: RECENT_COUNT }
    ).map((h) => docOption(h.doc, t));
    return [first, ...recent];
  }
  const hits = searchDocs(pool, q, { limit: MAX_RESULTS }).map((h) => docOption(h.doc, t));
  // 只要没有同名的就给「新建」：只看「有没有命中」的话，搜「周报」时正文提到周报的文章
  // 会把新建入口挤掉，用户就没法建一篇真正叫「周报」的了
  if (!pool.some((d) => d.title === q)) {
    hits.push({ key: "new", target: { kind: "new", title: q }, label: t("新建《{title}》", { title: q }), hint: "" });
  }
  return hits;
}

const inputCls =
  "w-full min-w-0 rounded-md border border-[var(--hairline)] bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--hairline-strong)]";

function Panel({
  docs,
  onSubmit,
  onClose,
}: {
  docs: DocMeta[];
  onSubmit: (text: string, target: AddTarget) => Promise<boolean>;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [pending, setPending] = useState(false);
  const t = useT();
  useDismissMenu(panelRef, onClose, true);
  useEscape(onClose);

  // 搜正文要逐篇读缓存，没变的输入不重算（输入任务文字时会频繁重渲染）
  const options = useMemo(() => buildOptions(docs, query, t), [docs, query, t]);
  const active = Math.min(sel, options.length - 1);

  const submit = async (target: AddTarget | undefined) => {
    if (!target || pending) return;
    if (!text.trim()) {
      taskRef.current?.focus();
      return;
    }
    // 提交中锁住：清单那篇还没建好时连敲两次回车会建出两篇「待办清单」
    setPending(true);
    const ok = await onSubmit(text, target);
    setPending(false);
    if (ok) onClose();
  };

  /** 两个输入框共用：↑↓ 换目标，回车提交；输入法组字时的回车是选词，不能当提交 */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = options.length;
      setSel((active + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      void submit(options[active]?.target);
    }
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("记一件事")}
      className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] p-2 text-[13px] shadow-lg"
    >
      <input
        ref={taskRef}
        autoFocus
        className={inputCls}
        placeholder={t("要做什么…")}
        value={text}
        disabled={pending}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="mb-1 mt-2.5 px-0.5 text-[12px] text-[var(--ink-faint)]">{t("记到")}</div>
      <input
        className={inputCls}
        placeholder={t("搜索文章…")}
        value={query}
        disabled={pending}
        onChange={(e) => {
          setQuery(e.target.value);
          setSel(0); // 换了一批结果，选中回到第一条
        }}
        onKeyDown={onKeyDown}
      />
      <div role="listbox" aria-label={t("目标文章")} className="mt-1">
        {options.map((o, i) => (
          <div
            key={o.key}
            role="option"
            aria-selected={i === active}
            className={`flex cursor-pointer items-baseline gap-2 rounded-md px-2 py-1.5 ${
              i === active ? "bg-[var(--accent-wash)]" : ""
            }`}
            onMouseEnter={() => setSel(i)}
            // 按下时不抢焦点：光标留在输入框里，点完还能接着打字
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setSel(i);
              void submit(o.target);
            }}
          >
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.hint ? <span className="max-w-[40%] shrink-0 truncate text-[12px] text-[var(--ink-faint)]">{o.hint}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 占位行 + 面板。面板关掉即卸载，下次打开是全新的状态（文字、搜索词、选中项都回到默认）。
 * docs 没载完时锁住：此时找不到清单那篇，提交会误建一篇新的。
 */
export function QuickAdd({
  disabled,
  docs,
  onSubmit,
}: {
  disabled: boolean;
  docs: DocMeta[];
  onSubmit: (text: string, target: AddTarget) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <div className="relative mb-1.5">
      <button
        type="button"
        // 标成菜单触发器：面板的外部关闭逻辑放它一马，再点一次由这里 toggle 关掉
        data-menu-trigger
        className="flex w-full cursor-pointer items-center gap-2.5 border-b border-[var(--hairline-soft)] px-0.5 py-2 text-left text-[14px] text-[var(--ink-faint)] hover:text-[var(--ink-soft)] disabled:cursor-default disabled:opacity-60"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-dashed border-[var(--hairline-strong)]" />
        {t("记一件事…")}
      </button>
      {open ? <Panel docs={docs} onSubmit={onSubmit} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
