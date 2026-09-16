"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "./types";

/** 图片库的数据层：分页拉取 + 模块缓存 + 哨兵预取 + 过滤 + 历史尺寸补录 */

const PAGE_SIZE = 24;

/** 工具栏分段控件的四档：前三档映射 kind，unused 走 filter=unused（服务端不分页） */
export type AssetFilter = "all" | "image" | "video" | "unused";

interface AssetPage {
  items: Asset[];
  total: number;
  nextCursor: string | null;
}

/**
 * 视图键 = 过滤档，唯一决定一份列表。
 * 键一变，渲染期就把旧列表判为作废（而不是在 effect 里 setState 清空），
 * 既避免闪一帧旧数据，也不碰 react-hooks/set-state-in-effect。
 */
const viewKeyOf = (filter: AssetFilter) => filter;

/** 默认视图：无过滤，只有它享受模块缓存 */
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
  /** null = 该视图还在首次加载 */
  assets: Asset[] | null;
  total: number;
  nextCursor: string | null;
}

/** 已加载的默认视图留在模块里，切回图片库先用它即时渲染，再后台校验 */
let galleryCache: { assets: Asset[]; total: number; nextCursor: string | null } | null = null;

const emptyState = (key: string): FeedState => ({
  key,
  assets: null,
  total: 0,
  nextCursor: null,
});

/**
 * 第一页结果 → 新状态；null = 保持原状。
 * 拉取失败且手上有缓存时先留着旧图，不要把界面清空。
 */
function firstPageState(
  key: string,
  page: AssetPage | null,
  cached: typeof galleryCache
): FeedState | null {
  if (!page) return cached ? null : { key, assets: [], total: 0, nextCursor: null };
  // 首页头部没变就保留已加载的长列表（滚了很远再切回来，不至于退回 24 张）
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
  /** 是否处于「无过滤」的默认视图——空态文案要分情况 */
  isDefaultView: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  /** 删除成功后：本地摘掉这条、总数 -1 */
  dropLocal: (id: string) => void;
  /** 缩略图量出的历史图片尺寸：更新本地并回写服务端，同一 id 只发一次 */
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
  // 键不匹配说明 state 属于上一个视图，渲染期直接当空处理
  const view = state.key === viewKey ? state : emptyState(viewKey);

  // 默认视图的结果回写模块缓存，下次进来直接有图
  useEffect(() => {
    if (state.key === DEFAULT_KEY && state.assets !== null) {
      galleryCache = {
        assets: state.assets,
        total: state.total,
        nextCursor: state.nextCursor,
      };
    }
  }, [state]);

  // 视图键一变（含挂载）就拉这个视图的第一页；
  // setState 落在 then 回调里，不在 effect 体内同步改状态
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

  /** 上传 / 同步之后回到第一页重拉：要的是最新结果，绕开缓存比对直接整体替换 */
  const refresh = useCallback(
    () =>
      fetchPage(filter, null)
        .catch(() => null)
        .then((page) => {
          // 重拉失败就保持现状，不能把已经显示出来的列表清空
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
        if (prev.key !== viewKey) return prev; // 翻页途中换了视图，结果作废
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

  // 滚动哨兵：离底部还有一段距离就预取下一页
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
    // 补录失败静默：尺寸只是展示信息，下次进来还会再量
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
