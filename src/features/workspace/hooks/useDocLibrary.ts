"use client";

import { useEffect, useRef, useState } from "react";
import { useStore, DEFAULT_MARKDOWN } from "@/store/useStore";
import { listLocalDocs, listLocalCats, DOCS_CHANGED_EVENT } from "@/lib/localDocs";
import { listMirrorDocs, setWasAuthed } from "@/lib/docStore";
import { startSync, syncNow, SYNC_DONE_EVENT } from "@/lib/sync";
import { toast } from "@/components/Toast";
import { TRASH } from "../constants";
import { mergedCloudList } from "../lib/docSource";
import {
  parseSidebarOrder,
  readLocalOrder,
  writeLocalOrder,
  type SidebarOrder,
} from "../lib/sidebarOrder";
import type { DocMeta } from "../types";

interface Params {
  loggedIn: boolean;
  offlineAuthed: boolean;
  localMode: boolean;
  activeCat: string;
}

/**
 * 文章库与分类的数据装载。完全本地优先：登录态列表先从本地镜像
 * （+ 待上云的本地文档）秒出，同步引擎每轮完成后再刷新。
 */
export function useDocLibrary({ loggedIn, offlineAuthed, localMode, activeCat }: Params) {
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [customCats, setCustomCats] = useState<string[]>([]);
  const [trashDocs, setTrashDocs] = useState<DocMeta[] | null>(null);
  // 侧栏手动排序：本地缓存秒出，登录后被服务端覆盖
  const [order, setOrder] = useState<SidebarOrder>(readLocalOrder);
  const migratedRef = useRef(false);

  /** 更新排序：本地立即生效并缓存，登录态异步推服务端（失败不打扰，下次改动再带上） */
  const updateOrder = (mutate: (prev: SidebarOrder) => SidebarOrder) => {
    setOrder((prev) => {
      const next = mutate(prev);
      writeLocalOrder(next);
      if (loggedIn) {
        void fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sidebarOrder: next }),
        }).catch(() => undefined);
      }
      return next;
    });
  };

  // 本地模式：文章与分类都从本地库读；渲染期间带守卫地装载（React 推荐模式）
  const [localLoaded, setLocalLoaded] = useState(false);
  if (localMode && !localLoaded) {
    setLocalLoaded(true);
    setDocs(listLocalDocs());
    setCustomCats(listLocalCats());
  }

  // 登录态列表同样在渲染期间带守卫地从本地镜像秒出
  const [cloudLoaded, setCloudLoaded] = useState(false);
  if ((loggedIn || offlineAuthed) && !cloudLoaded) {
    setCloudLoaded(true);
    setDocs(mergedCloudList());
  }

  // 本机数据一有写入（编辑器改标题/正文、移动分类）立即刷新列表，
  // 不用等同步引擎跑完一整轮——侧栏文件名要跟着编辑实时变
  useEffect(() => {
    const refresh = () => {
      if (localMode) setDocs(listLocalDocs());
      else if (loggedIn || offlineAuthed) setDocs(mergedCloudList());
    };
    window.addEventListener(DOCS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DOCS_CHANGED_EVENT, refresh);
  }, [loggedIn, offlineAuthed, localMode]);

  // 自建分类（允许空分类存在）
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    void fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((st) => {
        if (cancelled || !st) return;
        try {
          const list = JSON.parse(st.categories ?? "[]");
          if (Array.isArray(list)) {
            setCustomCats(list.filter((c: unknown): c is string => typeof c === "string"));
          }
        } catch {
          // 忽略脏数据
        }
        // 服务端的排序覆盖本地缓存（跨设备一致）；服务端还没存过则保留本地
        if (st.sidebarOrder && st.sidebarOrder !== "{}") {
          const remote = parseSidebarOrder(st.sidebarOrder);
          setOrder(remote);
          writeLocalOrder(remote);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  // 同步引擎：每轮完成后刷新列表；首次登录且云端为空时迁移旧的单篇本地草稿
  useEffect(() => {
    if (!loggedIn && !offlineAuthed) return;
    if (loggedIn) setWasAuthed();
    const refresh = () => {
      setDocs(mergedCloudList());
      if (
        loggedIn &&
        !migratedRef.current &&
        listMirrorDocs().length === 0 &&
        listLocalDocs().length === 0
      ) {
        migratedRef.current = true;
        const s = useStore.getState();
        const hasLocalWork =
          s.docId === null && s.content.trim() && s.content !== DEFAULT_MARKDOWN;
        void fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            hasLocalWork
              ? { title: s.title, content: s.content }
              : { title: "欢迎使用 xEdit", content: DEFAULT_MARKDOWN }
          ),
        })
          .then((res) => {
            if (res.ok) {
              if (hasLocalWork) toast("本地文稿已同步到云端", "success");
              void syncNow();
            }
          })
          .catch(() => undefined);
      }
    };
    window.addEventListener(SYNC_DONE_EVENT, refresh);
    const stop = startSync();
    return () => {
      window.removeEventListener(SYNC_DONE_EVENT, refresh);
      stop();
    };
  }, [loggedIn, offlineAuthed]);

  // 回收站列表（进入回收站时拉取）
  useEffect(() => {
    if (activeCat !== TRASH || !loggedIn) return;
    let cancelled = false;
    void fetch("/api/documents?trash=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (!cancelled) setTrashDocs(list);
      })
      .catch(() => {
        if (!cancelled) setTrashDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCat, loggedIn]);

  return { docs, setDocs, customCats, setCustomCats, trashDocs, setTrashDocs, order, updateOrder };
}

export type DocLibrary = ReturnType<typeof useDocLibrary>;
