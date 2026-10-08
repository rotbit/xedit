"use client";

/**
 * 「要做」栏顶上的快速输入：点那一行就地变成输入行，写完回车即记下。
 *
 * 默认是独立待办——日常要做的事不一定属于哪篇文章，记的时候不该被逼着选「记到哪」。
 * 独立待办仍落在一篇隐藏的待办清单文章里：借文章的存储与同步，跨设备免费，
 * 而那篇在文库层就被滤掉了，用户看不见它。
 * 关联文章是可选的次级动作：右侧「记到文章」点开才出搜索，有的事明确属于某篇稿子
 * （「补第三节的数据」）就记进那篇，回到文章里就能看到；搜不到还可以就地新建一篇。
 */
import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import type { TFn } from "@/i18n/t";
import { useT } from "@/i18n/useT";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { searchDocs } from "@/lib/docSearch";
import { isTemplateDoc } from "@/lib/templates";
import type { DocMeta } from "../../types";

/** 任务记到哪：待办清单（有就追加、没有就建）/ 某篇现有文章 / 以搜索词为标题新建一篇 */
export type AddTarget = { kind: "notes" } | { kind: "doc"; id: string } | { kind: "new"; title: string };

interface Option {
  key: string;
  target: AddTarget;
  label: string;
  /** 右侧灰字：分类名 */
  hint: string;
}

const MAX_RESULTS = 8;
const RECENT_COUNT = 7;
const NOTES: AddTarget = { kind: "notes" };

const docOption = (doc: DocMeta, t: TFn): Option => ({
  key: doc.id,
  target: { kind: "doc", id: doc.id },
  label: doc.title || t(UNTITLED_DOC),
  hint: doc.category ?? "",
});

/**
 * 「记到文章」的候选。docs 已是用户看得见的文章（待办清单那篇在文库层滤掉了），
 * 默认目标就是清单，这里不再列它。
 * 模板分类不进候选：往模板里记待办，从模板新建的每篇稿子都会带上它，
 * 而今天页又不收模板里的待办，记进去就等于看不见。
 */
function buildOptions(docs: DocMeta[], query: string, t: TFn): Option[] {
  const pool = docs.filter((d) => !isTemplateDoc(d));
  const q = query.trim();
  if (!q) return searchDocs(pool, "", { limit: RECENT_COUNT }).map((h) => docOption(h.doc, t));
  const hits = searchDocs(pool, q, { limit: MAX_RESULTS }).map((h) => docOption(h.doc, t));
  // 只要没有同名的就给「新建」：只看「有没有命中」的话，搜「周报」时正文提到周报的文章
  // 会把新建入口挤掉，用户就没法建一篇真正叫「周报」的了
  if (!pool.some((d) => d.title === q)) {
    hits.push({ key: "new", target: { kind: "new", title: q }, label: t("新建《{title}》", { title: q }), hint: "" });
  }
  return hits;
}

const searchCls =
  "w-full min-w-0 rounded-md border border-[var(--hairline)] bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--hairline-strong)]";

/** 输入行下方的文章选择器：只负责挑，选中交给 onPick，不提交 */
function Picker({ docs, onPick }: { docs: DocMeta[]; onPick: (o: Option) => void }) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const t = useT();
  // 搜正文要逐篇读缓存，没变的输入不重算
  const options = useMemo(() => buildOptions(docs, query, t), [docs, query, t]);
  const active = Math.min(sel, options.length - 1);

  /** ↑↓ 换选中，回车选中；输入法组字时的回车是选词，不能当选中 */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const n = options.length;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && n > 0) {
      e.preventDefault();
      setSel((active + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = options[active];
      if (o) onPick(o);
    }
  };

  return (
    <div
      role="dialog"
      aria-label={t("记到文章")}
      className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] p-2 text-[13px] shadow-lg"
    >
      <input
        autoFocus
        className={searchCls}
        placeholder={t("搜索文章…")}
        value={query}
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
            // 按下时不抢焦点：选完由上层把焦点还给主输入框
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(o)}
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
 * 打开态的输入行（连同选择器）。关掉即卸载，下次打开是全新的状态，目标也回到独立待办。
 */
function InputRow({
  docs,
  onSubmit,
  onClose,
}: {
  docs: DocMeta[];
  onSubmit: (text: string, target: AddTarget) => Promise<boolean>;
  onClose: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<AddTarget>(NOTES);
  /** 关联文章时右侧标签的文字；默认目标不显示标签 */
  const [targetLabel, setTargetLabel] = useState("");
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState(false);
  const t = useT();
  useDismissMenu(rowRef, onClose, true);
  // Esc 分两级：选择器开着先只关选择器，回到输入行；否则关掉整个输入行
  useEscape(() => {
    if (picking) {
      setPicking(false);
      inputRef.current?.focus();
    } else onClose();
  });

  const submit = async () => {
    if (pending || !text.trim()) return;
    // 提交中锁住：清单那篇还没建好时连敲两次回车会建出两篇「待办清单」
    setPending(true);
    const ok = await onSubmit(text, target);
    setPending(false);
    if (ok) onClose();
    else inputRef.current?.focus(); // 失败不关、字不清，焦点回去方便重试
  };

  const pick = (o: Option) => {
    setTarget(o.target);
    setTargetLabel(o.target.kind === "new" ? o.label : t("《{title}》", { title: o.label }));
    setPicking(false);
    // 选完让用户接着打字或直接回车
    inputRef.current?.focus();
  };

  const detach = () => {
    setTarget(NOTES);
    setTargetLabel("");
    inputRef.current?.focus();
  };

  return (
    <div ref={rowRef} className="relative">
      <div
        role="group"
        aria-label={t("记一件事")}
        className="flex items-center gap-2.5 border-b border-[var(--hairline-soft)] px-0.5 py-2"
      >
        <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-dashed border-[var(--hairline-strong)]" />
        <input
          ref={inputRef}
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--ink-faint)] disabled:opacity-60"
          placeholder={t("要做什么…")}
          value={text}
          disabled={pending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 输入法组字时的回车是选词，不能当提交
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            void submit();
          }}
        />
        {target.kind === "notes" ? (
          <button
            type="button"
            className="shrink-0 cursor-pointer text-[12.5px] text-[var(--ink-faint)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-60"
            disabled={pending}
            aria-expanded={picking}
            onClick={() => setPicking((v) => !v)}
          >
            {t("记到文章")}
          </button>
        ) : (
          <span className="flex max-w-[40%] shrink-0 items-center gap-1 text-[12.5px] text-[var(--ink-soft)]">
            <span className="min-w-0 truncate">{targetLabel}</span>
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded p-0.5 text-[var(--ink-faint)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-60"
              aria-label={t("取消关联")}
              disabled={pending}
              onClick={detach}
            >
              <X size={12} />
            </button>
          </span>
        )}
      </div>
      {picking ? <Picker docs={docs} onPick={pick} /> : null}
    </div>
  );
}

/**
 * 占位行 + 打开态的输入行。
 * 全库没载完时锁住（disabled）：此时找不到清单那篇，提交会误建一篇新的。
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
      {open ? (
        <InputRow docs={docs} onSubmit={onSubmit} onClose={() => setOpen(false)} />
      ) : (
        <button
          type="button"
          // 标成菜单触发器：外部关闭逻辑放它一马，开关由这里自己 toggle
          data-menu-trigger
          className="flex w-full cursor-pointer items-center gap-2.5 border-b border-[var(--hairline-soft)] px-0.5 py-2 text-left text-[14px] text-[var(--ink-faint)] hover:text-[var(--ink-soft)] disabled:cursor-default disabled:opacity-60"
          disabled={disabled}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-dashed border-[var(--hairline-strong)]" />
          {t("记一件事…")}
        </button>
      )}
    </div>
  );
}
