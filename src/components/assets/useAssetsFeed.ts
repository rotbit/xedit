"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "./types";

/** Image library data layer: paginated fetching + module cache + sentinel prefetch + filtering + backfilling old dimensions */

const PAGE_SIZE = 24;

/** The four segments of the toolbar control: the first three map to kind, unused uses filter=unused (not paginated server-side) */
export type AssetFilter = "all" | "image" | "video" | "unused";

interface AssetPage {
  items: Asset[];
  total: number;
  nextCursor: string | null;
}

/**
 * View key = filter segment, which uniquely identifies a list.
 * When the key changes, the old list is treated as stale during render (instead of clearing it via setState in an effect),
 * which avoids flashing a frame of old data and stays clear of react-hooks/set-state-in-effect.
 */
const viewKeyOf = (filter: AssetFilter) => filter;

/** Default view: unfiltered; it's the only one that uses the module cache */
const DEFAULT_KEY = viewKeyOf("all");

function searchParams(filter: AssetFilter, cursor: string | null) {
  const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (filter === "image" || filter === "video") qs.set("kind", filter);
  if (filter === "unused") qs.set("filter", "unused");
  if (cursor) qs.set("cursor", cursor);
  return qs;
}

async function fetchPage(filter: AssetFilter, cursor: string | null): Promise<AssetPage | null> {
  const res = await fetch(`/api/assets?${searchParams(filter, cursor)}`);
  if (!res.ok) return null;
  return res.json();
}

interface FeedState {
  key: string;
  /** null = this view is still on its first load */
  assets: Asset[] | null;
  total: number;
  nextCursor: string | null;
}

/** The loaded default view stays in the module, so returning to the image library renders it instantly, then revalidates in the background */
let galleryCache: { assets: Asset[]; total: number; nextCursor: string | null } | null = null;

const emptyState = (key: string): FeedState => ({
  key,
  assets: null,
  total: 0,
  nextCursor: null,
});

/**
 * First-page result → new state; null = keep as is.
 * If the fetch fails while a cache is on hand, keep the old images instead of clearing the UI.
 */
function firstPageState(
  key: string,
  page: AssetPage | null,
  cached: typeof galleryCache
): FeedState | null {
  if (!page) return cached ? null : { key, assets: [], total: 0, nextCursor: null };
  // If the head of page one hasn't changed, keep the long loaded list (scrolling far and coming back shouldn't drop you to 24 items)
  const sameHead =
    cached &&
    cached.assets.length >= page.items.length &&
    page.items.every((it, i) => cached.assets[i]?.id === it.id);
  if (sameHead) {
    return { key, assets: cached.assets, total: page.total, nextCursor: cached.nextCursor };
  }
  return { key, assets: page.items, total: page.total, nextCursor: page.nextCursor };
}

export interface AssetsFeed {
  assets: Asset[] | null;
  total: number;
  hasMore: boolean;
  filter: AssetFilter;
  setFilter: (filter: AssetFilter) => void;
  /** Whether we're on the unfiltered default view — the empty-state copy differs */
  isDefaultView: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  /** After a successful delete: drop the item locally and decrement the total */
  dropLocal: (id: string) => void;
  /** Older image dimensions measured by thumbnails: update locally and write back to the server, once per id */
  measure: (id: string, width: number, height: number) => void;
}

export function useAssetsFeed(): AssetsFeed {
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [state, setState] = useState<FeedState>(() =>
    galleryCache ? { key: DEFAULT_KEY, ...galleryCache } : emptyState(DEFAULT_KEY)
  );
  const loadingMoreRef = useRef(false);
  const measuredRef = useRef<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);

  const viewKey = viewKeyOf(filter);
  // A mismatched key means the state belongs to the previous view, so treat it as empty during render
  const view = state.key === viewKey ? state : emptyState(viewKey);

  // Write the default view's result back to the module cache so images are there next time
  useEffect(() => {
    if (state.key === DEFAULT_KEY && state.assets !== null) {
      galleryCache = {
        assets: state.assets,
        total: state.total,
        nextCursor: state.nextCursor,
      };
    }
  }, [state]);

  // Whenever the view key changes (including mount), fetch that view's first page;
  // setState happens in the then callback, not synchronously inside the effect body
  useEffect(() => {
    let cancelled = false;
    const cached = viewKey === DEFAULT_KEY ? galleryCache : null;
    void fetchPage(filter, null)
      .catch(() => null)
      .then((page) => {
        if (cancelled) return;
        const next = firstPageState(viewKey, page, cached);
        if (next) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [viewKey, filter]);

  /** After upload / sync, refetch from page one: we want fresh results, so skip the cache comparison and replace wholesale */
  const refresh = useCallback(
    () =>
      fetchPage(filter, null)
        .catch(() => null)
        .then((page) => {
          // If the refetch fails keep things as they are; never clear a list that's already showing
          if (!page) return;
          const next = firstPageState(viewKey, page, null);
          if (next) setState(next);
        }),
    [filter, viewKey]
  );

  const loadMore = useCallback(async () => {
    const cursor = view.nextCursor;
    if (loadingMoreRef.current || !cursor) return;
    loadingMoreRef.current = true;
    try {
      const page = await fetchPage(filter, cursor).catch(() => null);
      if (!page) return;
      setState((prev) => {
        if (prev.key !== viewKey) return prev; // The view changed mid-pagination, so discard the result
        const seen = new Set((prev.assets ?? []).map((a) => a.id));
        return {
          key: viewKey,
          assets: [...(prev.assets ?? []), ...page.items.filter((a) => !seen.has(a.id))],
          total: page.total,
          nextCursor: page.nextCursor,
        };
      });
    } finally {
      loadingMoreRef.current = false;
    }
  }, [view.nextCursor, filter, viewKey]);

  // Scroll sentinel: prefetch the next page while still some distance from the bottom
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !view.nextCursor) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" }
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [view.nextCursor, loadMore]);

  const dropLocal = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      assets: prev.assets?.filter((a) => a.id !== id) ?? null,
      total: Math.max(0, prev.total - 1),
    }));
  }, []);

  const measure = useCallback((id: string, width: number, height: number) => {
    if (measuredRef.current.has(id)) return;
    measuredRef.current.add(id);
    setState((prev) => ({
      ...prev,
      assets: prev.assets?.map((a) => (a.id === id ? { ...a, width, height } : a)) ?? null,
    }));
    // Backfill failures are silent: dimensions are display-only and will be measured again next time
    void fetch(`/api/assets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ width, height }),
    }).catch(() => undefined);
  }, []);

  return useMemo(
    () => ({
      assets: view.assets,
      total: view.total,
      hasMore: view.nextCursor !== null,
      filter,
      setFilter,
      isDefaultView: viewKey === DEFAULT_KEY,
      sentinelRef,
      loadMore,
      refresh,
      dropLocal,
      measure,
    }),
    [
      view.assets,
      view.total,
      view.nextCursor,
      filter,
      viewKey,
      loadMore,
      refresh,
      dropLocal,
      measure,
    ]
  );
}
