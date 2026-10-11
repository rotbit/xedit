"use client";

/**
 * 待办关联文章用的选择器：搜索框 + 最近文章 / 搜索结果 + 末尾常驻的「新建文章…」。
 * 只负责挑，选中交给 onPick；选了「新建」也只上报，落到哪个文件夹由调用方接着问
 * （它们各自要先收起自己的弹层）。外框（定位、边框、阴影）由调用方给——
 * 快速输入里是输入行下方的整宽浮层，今天页的行里是行尾的小弹层。
 */
import { useMemo, useState, type ReactNode } from "react";
import { FilePlus2 } from "lucide-react";
import type { TFn } from "@/i18n/t";
import { useT } from "@/i18n/useT";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { searchDocs } from "@/lib/docSearch";
import { isTemplateDoc } from "@/lib/templates";
import type { DocMeta } from "../../types";

/** 选中的是哪篇：现有文章 / 新建一篇（title 为空串表示没给标题，由调用方拿任务文字顶上） */
export type DocPick = { kind: "doc"; id: string } | { kind: "new"; title: string };

export interface Option {
  key: string;
  pick: DocPick;
  label: string;
  /** 右侧灰字：分类名 */
  hint: string;
}

const MAX_RESULTS = 8;
const RECENT_COUNT = 7;

const docOption = (doc: DocMeta, t: TFn): Option => ({
  key: doc.id,
  pick: { kind: "doc", id: doc.id },
  label: doc.title || t(UNTITLED_DOC),
  hint: doc.category ?? "",
});

/**
 * 关联文章的候选。docs 已是用户看得见的文章（待办清单那篇在文库层滤掉了）。
 * 模板分类不进候选：模板是给新稿用的底子，不是谁要做的事所属的稿子。
 */
function buildOptions(docs: DocMeta[], query: string, t: TFn): Option[] {
  const pool = docs.filter((d) => !isTemplateDoc(d));
  const q = query.trim();
  // 空搜索词时 searchDocs 按最近排，即「最近文章」
  const hits = searchDocs(pool, q, { limit: q ? MAX_RESULTS : RECENT_COUNT }).map((h) => docOption(h.doc, t));
  // 「新建」常驻末尾：要关联的稿子常常还不存在，不该非得先搜一次扑空才给入口。
  // 搜索词没有同名文章时就拿它当标题——只看「有没有命中」的话，搜「周报」时正文提到周报的文章
  // 会把新建入口挤掉，用户就没法建一篇真正叫「周报」的了；有同名的就不拿它当标题，免得建出重名
  const titled = q !== "" && !pool.some((d) => d.title === q);
  hits.push({
    key: "new",
    pick: { kind: "new", title: titled ? q : "" },
    label: titled ? t("新建《{title}》", { title: q }) : t("新建文章…"),
    hint: "",
  });
  return hits;
}

const searchCls =
  "w-full min-w-0 rounded-md border border-[var(--hairline)] bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--hairline-strong)]";

export function DocPicker({
  docs,
  onPick,
  top,
}: {
  docs: DocMeta[];
  onPick: (o: Option) => void;
  /** 列表顶部的额外一行（如「取消关联」），不参与 ↑↓ 选择 */
  top?: ReactNode;
}) {
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
    <>
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
      <div className="mt-1">
        {top}
        <div role="listbox" aria-label={t("目标文章")}>
          {options.map((o, i) => (
            <div
              key={o.key}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-baseline gap-2 rounded-md px-2 py-1.5 ${
                i === active ? "bg-[var(--accent-wash)]" : ""
              }`}
              onMouseEnter={() => setSel(i)}
              // 按下时不抢焦点：选完由上层决定焦点去哪
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(o)}
            >
              {o.pick.kind === "new" ? (
                <FilePlus2 size={13} className="shrink-0 self-center text-[var(--ink-faint)]" />
              ) : null}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.hint ? <span className="max-w-[40%] shrink-0 truncate text-[12px] text-[var(--ink-faint)]">{o.hint}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
