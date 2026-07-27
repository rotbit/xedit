"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { ASSETS, STATS } from "../constants";
import { allCategories } from "../lib/catTree";
import { ContentHeader } from "./ContentHeader";
import { DocCardGrid } from "./DocCardGrid";
import { DocListEmpty, DocListSkeleton } from "./DocListStates";
import { DocListView } from "./DocListView";
import type { Workspace } from "../hooks/useWorkspace";

/** 重型视图按需加载：阅读器连带 markdown 渲染/主题/复制管线，不该进首屏包 */
const viewLoading = () => (
  <div className="flex justify-center pt-24">
    <Loader2 size={20} className="animate-spin text-[var(--ink-faint)]" />
  </div>
);
const ArticleReader = dynamic(
  () => import("@/components/ArticleReader").then((m) => m.ArticleReader),
  { ssr: false, loading: viewLoading }
);
const WritingStats = dynamic(
  () => import("@/features/stats/WritingStats").then((m) => m.WritingStats),
  { ssr: false, loading: viewLoading }
);
const AssetsGallery = dynamic(
  () => import("@/components/AssetsGallery").then((m) => m.AssetsGallery),
  { ssr: false, loading: viewLoading }
);

/** 文章列表区：装载中骨架 → 空态 → 列表 / 卡片 */
function DocList({ ws }: { ws: Workspace }) {
  const { nav, prefs, library, filtered } = ws;
  const source = nav.isTrash ? library.trashDocs : library.docs;

  if (source === null) return <DocListSkeleton />;
  if (filtered.length === 0) {
    return (
      <DocListEmpty search={nav.search} isTrash={nav.isTrash} activeCat={nav.activeCat} />
    );
  }
  // 回收站只有卡片形态（需要底部的恢复 / 彻底删除按钮）
  if (prefs.docView === "list" && !nav.isTrash) return <DocListView ws={ws} />;
  return <DocCardGrid ws={ws} />;
}

/** 内容区：面包屑顶栏 + 独立滚动的视图主体 */
export function WorkspaceContent({ ws }: { ws: Workspace }) {
  const { nav, library, docActions, config } = ws;
  /** 阅读视图下，ArticleReader 的操作按钮通过 portal 挂进面包屑顶栏右侧，省掉一整条横栏 */
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);

  const { readingId, isTrash, activeCat } = nav;
  const readingDoc = readingId
    ? ((library.docs ?? []).find((d) => d.id === readingId) ?? null)
    : null;

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <ContentHeader ws={ws} readingDoc={readingDoc} onActionSlotRef={setActionSlot} />
      {readingId && !isTrash ? (
        // 文章视图占满内容区高度：便于「双屏」左右各自独立滚动
        <ArticleReader
          docId={readingId}
          actionSlot={actionSlot}
          categories={allCategories(library.customCats, library.docs)}
          onCategoryChange={(category) => {
            library.setDocs(
              (prev) => prev?.map((d) => (d.id === readingId ? { ...d, category } : d)) ?? null
            );
          }}
          onDelete={() => {
            const d = (library.docs ?? []).find((x) => x.id === readingId);
            if (d) void docActions.removeDoc(d);
          }}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[960px] px-4 pb-24 pt-6 sm:px-8">
            {activeCat === STATS ? (
              <WritingStats />
            ) : activeCat === ASSETS ? (
              <AssetsGallery ossConfigured={config?.oss ?? false} onOpenDoc={nav.openDoc} />
            ) : (
              <DocList ws={ws} />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
