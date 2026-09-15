"use client";

// 文章底部的反向链接面板：谁链到了本文（linked）、谁提到了本文却没链（unlinked）。
// 计算是纯函数（lib/backlinks），这里只管防抖、折叠与呈现。

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { computeBacklinks, type BacklinkHit } from "@/lib/backlinks";
import { MatchHighlight } from "./MatchHighlight";
import { UNCATEGORIZED } from "@/features/workspace/constants";
import type { DocMeta } from "@/features/workspace/types";

/**
 * 标题防抖：改标题是逐字敲的，而每算一次反链都要把全库正文从 localStorage 捞一遍。
 * 防抖放在面板里而不是 ArticleReader —— 让「反链自己的节流需求」留在反链这一侧，
 * 上层只管把当前标题原样传进来。120ms 与快速切换器同一档。
 */
const DEBOUNCE_MS = 120;

export function BacklinksPanel({
  docs,
  docId,
  title,
  onOpenDoc,
}: {
  /** 全部文章（不含回收站） */
  docs: DocMeta[];
  docId: string;
  title: string;
  onOpenDoc?: (id: string) => void;
}) {
  const [debounced, setDebounced] = useState(title);
  const [linkedOpen, setLinkedOpen] = useState(true);
  // 未链接的提及是「可能有关」的弱信号，默认收起，需要时再展开
  const [mentionOpen, setMentionOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(title), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [title]);

  // 只在「别的文章」有增删改时才重算：本文每次自动保存都会换一份 docs 数组，
  // 但本文改了不影响谁链到本文，没必要为此把全库正文再捞一遍
  const othersStamp = docs
    .filter((d) => d.id !== docId)
    .map((d) => `${d.id}@${d.updatedAt}`)
    .join("\n");
  const { linked, unlinked } = useMemo(
    () => computeBacklinks(docs, { id: docId, title: debounced }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- docs 由 othersStamp 代表
    [othersStamp, docId, debounced]
  );

  if (docs.length === 0) return null;
  const total = linked.length + unlinked.length;

  return (
    <section className="mt-16 border-t border-[var(--hairline-soft)] pt-5">
      <div className="flex items-baseline gap-1.5 text-[12px] text-[var(--ink-faint)]">
        <span>反向链接</span>
        {total > 0 ? <span>{total}</span> : null}
      </div>

      {total === 0 ? (
        <p className="mt-2.5 text-[12.5px] text-[var(--ink-faint)]">还没有其他文章链接到本文</p>
      ) : (
        <div className="mt-2.5">
          <Group
            label="链接到本文"
            hits={linked}
            open={linkedOpen}
            onToggle={() => setLinkedOpen((v) => !v)}
            onOpenDoc={onOpenDoc}
          />
          <Group
            label="未链接的提及"
            hits={unlinked}
            open={mentionOpen}
            onToggle={() => setMentionOpen((v) => !v)}
            onOpenDoc={onOpenDoc}
          />
        </div>
      )}
    </section>
  );
}

/** 一个分组：空组直接不出现，省得留一行「(0)」占位 */
function Group({
  label,
  hits,
  open,
  onToggle,
  onOpenDoc,
}: {
  label: string;
  hits: BacklinkHit[];
  open: boolean;
  onToggle: () => void;
  onOpenDoc?: (id: string) => void;
}) {
  if (hits.length === 0) return null;
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="-ml-1 flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-[12px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
      >
        <ChevronRight
          size={12}
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        />
        <span>
          {label} ({hits.length})
        </span>
      </button>
      {open ? (
        <div className="mt-0.5">
          {hits.map((hit) => (
            <Row key={hit.doc.id} hit={hit} onOpenDoc={onOpenDoc} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Row({ hit, onOpenDoc }: { hit: BacklinkHit; onOpenDoc?: (id: string) => void }) {
  const { doc } = hit;
  return (
    <button
      type="button"
      onClick={() => onOpenDoc?.(doc.id)}
      className="flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--accent-wash)]"
    >
      <FileText size={13} className="mt-[3px] shrink-0 text-[var(--ink-faint)]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink)]">
            {doc.title || "未命名文章"}
          </span>
          <span className="max-w-[9rem] shrink-0 truncate text-[11px] text-[var(--ink-faint)]">
            {doc.category || UNCATEGORIZED}
          </span>
        </span>
        {hit.snippet ? (
          <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-soft)]">
            <MatchHighlight text={hit.snippet} ranges={hit.ranges} />
          </span>
        ) : null}
      </span>
    </button>
  );
}
