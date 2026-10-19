"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { ASSETS, HISTORY, SETTINGS, TODAY } from "../constants";
import { allCategories } from "../lib/catTree";
import { ContentHeader } from "./ContentHeader";
import { DocListEmpty, DocListSkeleton } from "./DocListStates";
import { DocListView } from "./DocListView";
import { DocTimeline } from "./DocTimeline";
import type { Workspace } from "../hooks/useWorkspace";

/** Heavy views load on demand: the reader pulls in markdown rendering / themes / the copy pipeline and shouldn't be in the initial bundle */
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

/** The Today page carries todo aggregation and the daily log; only people who open it need it */
const TodayView = dynamic(() => import("./today/TodayView").then((m) => m.TodayView), {
  ssr: false,
  loading: viewLoading,
});

/** "Completed history" calendar review page: entered from Today, also loaded on demand */
const HistoryView = dynamic(() => import("./history/HistoryView").then((m) => m.HistoryView), {
  ssr: false,
  loading: viewLoading,
});

/** "Settings" page: entered from the avatar menu, also loaded on demand */
const SettingsView = dynamic(() => import("./settings/SettingsView").then((m) => m.SettingsView), {
  ssr: false,
  loading: viewLoading,
});

/**
 * After the list's first frame renders, warm up the reader module while the browser is idle:
 * with its markdown rendering pipeline it's the largest lazy chunk, and fetching it only when a doc is opened means seconds of spinner on a cold cache;
 * once it's in the module cache, dynamic() resolves immediately on first render. import() uses the same path
 * as the dynamic above, so it's the same chunk and isn't downloaded twice.
 */
function usePrefetchReader() {
  useEffect(() => {
    const prefetch = () => void import("@/components/ArticleReader");
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(prefetch, 1500); // Safari has no requestIdleCallback
    return () => clearTimeout(t);
  }, []);
}

/** Doc list area: loading skeleton → empty state → compact list / timeline */
function DocList({ ws }: { ws: Workspace }) {
  const { nav, prefs, library, filtered } = ws;
  const source = nav.isTrash ? library.trashDocs : library.docs;

  if (source === null) return <DocListSkeleton />;
  if (filtered.length === 0) {
    return (
      <DocListEmpty search={nav.search} isTrash={nav.isTrash} activeCat={nav.activeCat} />
    );
  }
  // The trash only has the timeline form (rows need restore / delete forever buttons on the right)
  if (prefs.docView === "list" && !nav.isTrash) return <DocListView ws={ws} />;
  return <DocTimeline ws={ws} />;
}

/** Content area: breadcrumb top bar + independently scrolling view body */
export function WorkspaceContent({ ws }: { ws: Workspace }) {
  const { nav, library, docActions, config } = ws;
  /** In reading view, ArticleReader's action buttons are portaled into the right side of the breadcrumb bar, saving a whole toolbar row */
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);
  usePrefetchReader();

  const { readingId, isTrash, activeCat } = nav;
  const readingDoc = readingId
    ? ((library.docs ?? []).find((d) => d.id === readingId) ?? null)
    : null;
  // Recompute the full category set only when the library / custom categories change: Chinese collator sorting isn't cheap,
  // and a stable array reference avoids feeding ArticleReader a new reference every time
  const categories = useMemo(
    () => allCategories(library.customCats, library.docs),
    [library.customCats, library.docs]
  );

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <ContentHeader ws={ws} readingDoc={readingDoc} onActionSlotRef={setActionSlot} />
      {readingId && !isTrash ? (
        // The doc view fills the content area's height so "split view" panes can scroll independently
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
          // The three things [[wikilinks]] need: the library (to find targets by title), open, and create-by-title when not found
          docs={library.docs ?? undefined}
          onOpenDoc={nav.openDoc}
          onCreateDoc={docActions.createDoc}
        />
      ) : activeCat === ASSETS ? (
        // The image library is a full-width two-pane layout (grid + right detail panel): no centered narrow container, it manages its own scrolling
        <AssetsGallery ossConfigured={config?.oss ?? false} onOpenDoc={nav.openDoc} />
      ) : activeCat === TODAY ? (
        <TodayView ws={ws} />
      ) : activeCat === HISTORY ? (
        <HistoryView ws={ws} />
      ) : activeCat === SETTINGS ? (
        <SettingsView ws={ws} />
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
