"use client";

// Obsidian 式快速切换器（⌘O / ⌘P）：打字即搜标题与正文，↑↓ 选、↵ 开。
// 检索本身在 lib/docSearch 里跑（纯 localStorage，离线可用），这里只管数据源与行渲染，
// 弹窗外壳（遮罩、输入框、列表、键盘导航）与命令面板共用 PaletteShell。

import { useEffect, useMemo, useState } from "react";
import { FileText, Search } from "lucide-react";
import { PaletteShell } from "./PaletteShell";
import { MatchHighlight } from "./MatchHighlight";
import { matchRanges, searchDocs, splitQuery } from "@/lib/docSearch";
import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";
import { formatRelativeTime } from "@/lib/format";
import type { DocMeta } from "@/features/workspace/types";

/** 一次最多列 30 条：再多也翻不动，键盘选择反而变慢 */
const LIMIT = 30;
/** 击键到检索之间的防抖：正文要逐篇读 localStorage，每键一读太亏 */
const DEBOUNCE_MS = 120;

export function QuickSwitcher({
  open,
  docs,
  onClose,
  onOpen,
}: {
  open: boolean;
  docs: DocMeta[];
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  // 每次打开都是一次全新的检索：上次的关键词不留到下一次。
  // 渲染期间带守卫地重置（React 推荐模式，同 useWorkspaceNav 消费 ?doc 的写法），
  // 放 effect 里会多跑一帧——弹窗会先闪一下上次的结果
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setDebounced("");
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // open 与 wasOpen 不齐的那一帧是上面重置触发的重渲染前夜，关键词还是上一次的：
  // 此时不搜，免得拿一个作废的词白扫一遍全库正文（几百篇就是几百次 localStorage 读）
  const hits = useMemo(
    () => (open && open === wasOpen ? searchDocs(docs, debounced, { limit: LIMIT }) : []),
    [open, wasOpen, docs, debounced]
  );
  const terms = useMemo(() => splitQuery(debounced), [debounced]);

  const q = debounced.trim();

  return (
    <PaletteShell
      open={open}
      icon={<Search size={15} className="shrink-0 text-[var(--ink-faint)]" />}
      placeholder="搜索文章标题或正文…"
      hint="↑↓ 选择 · ↵ 打开 · esc 关闭"
      query={query}
      onQueryChange={setQuery}
      resetKey={debounced}
      items={hits}
      keyOf={(hit) => hit.doc.id}
      itemAlign="start"
      emptyText={q ? `没有找到「${q}」` : "还没有文章"}
      listTop={
        q ? null : (
          <p className="px-2.5 pb-1 pt-1 text-[11px] text-[var(--ink-faint)]">最近编辑</p>
        )
      }
      onPick={(hit) => onOpen(hit.doc.id)}
      onClose={onClose}
      renderItem={(hit) => {
        const { doc } = hit;
        const title = doc.title || UNTITLED_DOC;
        return (
          <>
            <FileText size={13} className="mt-[3px] shrink-0 text-[var(--ink-faint)]" />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--ink)]">
                  <MatchHighlight text={title} ranges={matchRanges(title, terms)} />
                </span>
                <span className="max-w-[9rem] shrink-0 truncate text-[11px] text-[var(--ink-faint)]">
                  {doc.category || UNCATEGORIZED}
                </span>
                <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">
                  {formatRelativeTime(doc.updatedAt)}
                </span>
              </span>
              {hit.snippet ? (
                <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-soft)]">
                  <MatchHighlight text={hit.snippet} ranges={hit.ranges} />
                </span>
              ) : null}
            </span>
          </>
        );
      }}
    />
  );
}
