"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { ASSETS } from "../constants";
import { allCategories } from "../lib/catTree";
import { ContentHeader } from "./ContentHeader";
import { DocListEmpty, DocListSkeleton } from "./DocListStates";
import { DocListView } from "./DocListView";
import { DocTimeline } from "./DocTimeline";
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
const AssetsGallery = dynamic(
  () => import("@/components/assets/AssetsGallery").then((m) => m.AssetsGallery),
  { ssr: false, loading: viewLoading }
);

/**
 * 列表首帧渲染完后趁浏览器空闲预热阅读器模块：
 * 它连带 markdown 渲染管线是最大的懒加载块，等点开文章再现拉，冷缓存下要转几秒圈；
 * 提前拉进模块缓存后，dynamic() 首次渲染即刻解析。import() 与上面 dynamic 的
 * 路径相同，打的是同一个 chunk，不会重复下载。
 */
function usePrefetchReader() {
  useEffect(() => {
    const prefetch = () => void import("@/components/ArticleReader");
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(prefetch, 1500); // Safari 没有 requestIdleCallback
    return () => clearTimeout(t);
  }, []);
}

/** 文章列表区：装载中骨架 → 空态 → 紧凑列表 / 时间流 */
function DocList({ ws }: { ws: Workspace }) {
  const { nav, prefs, library, filtered } = ws;
  const source = nav.isTrash ? library.trashDocs : library.docs;

  if (source === null) return <DocListSkeleton />;
  if (filtered.length === 0) {
    return (
      <DocListEmpty search={nav.search} isTrash={nav.isTrash} activeCat={nav.activeCat} />
    );
  }
  // 回收站只有时间流形态（行右侧需要恢复 / 彻底删除按钮）
  if (prefs.docView === "list" && !nav.isTrash) return <DocListView ws={ws} />;
  return <DocTimeline ws={ws} />;
}

/** 内容区：面包屑顶栏 + 独立滚动的视图主体 */
export function WorkspaceContent({ ws }: { ws: Workspace }) {
  const { nav, library, docActions, config } = ws;
  /** 阅读视图下，ArticleReader 的操作按钮通过 portal 挂进面包屑顶栏右侧，省掉一整条横栏 */
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);
  usePrefetchReader();

  const { readingId, isTrash, activeCat } = nav;
  const readingDoc = readingId
    ? ((library.docs ?? []).find((d) => d.id === readingId) ?? null)
    : null;
  // 分类全集只在文库/自建分类变化时重算：中文 collator 排序不便宜，
  // 且稳定的数组引用能避免把新引用每次都喂给 ArticleReader
  const categories = useMemo(
    () => allCategories(library.customCats, library.docs),
    [library.customCats, library.docs]
  );

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <ContentHeader ws={ws} readingDoc={readingDoc} onActionSlotRef={setActionSlot} />
      {readingId && !isTrash ? (
        // 文章视图占满内容区高度：便于「双屏」左右各自独立滚动
        <ArticleReader
          docId={readingId}
          actionSlot={actionSlot}
          categories={categories}
          onCategoryChange={(category) => {
            library.setDocs(
              (prev) => prev?.map((d) => (d.id === readingId ? { ...d, category } : d)) ?? null
            );
          }}
          onDelete={() => {
            const d = (library.docs ?? []).find((x) => x.id === readingId);
            if (d) void docActions.removeDoc(d);
          }}
          // [[双向链接]] 需要的三样：文库（按标题找目标）、打开、找不到时按标题新建
          docs={library.docs ?? undefined}
          onOpenDoc={nav.openDoc}
          onCreateDoc={docActions.createDoc}
        />
      ) : activeCat === ASSETS ? (
        // 图片库是通栏两栏（网格 + 右侧详情栏），不套居中窄容器、自己管滚动
        <AssetsGallery ossConfigured={config?.oss ?? false} onOpenDoc={nav.openDoc} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[960px] px-4 pb-24 pt-6 sm:px-8">
            <DocList ws={ws} />
          </div>
        </div>
      )}
    </main>
  );
}
