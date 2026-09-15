"use client";

import { useEffect, useRef, useState } from "react";
import { useStore, DEFAULT_MARKDOWN } from "@/store/useStore";
import { listLocalDocs, listLocalCats, DOCS_CHANGED_EVENT } from "@/lib/localDocs";
import { getBrowserBackend, LOCAL_BACKEND_CHANGED_EVENT } from "@/lib/localBackend";
import { getActiveVault } from "@/lib/localBackend/vaultSession";
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

/** 排序存哪儿看当前后端：Vault 的那份跟着文件夹走（换设备也带着），
 *  浏览器存储的仍落 localStorage */
function readActiveOrder(): SidebarOrder {
  const vault = getActiveVault();
  return vault ? parseSidebarOrder(vault.loadOrder()) : readLocalOrder();
}

/** 两份列表在侧栏可见字段上是否一致（顺序敏感，列表本身已排好序） */
function sameDocList(a: DocMeta[], b: DocMeta[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((d, i) => {
    const e = b[i];
    return (
      d.id === e.id &&
      d.title === e.title &&
      d.category === e.category &&
      d.updatedAt === e.updatedAt
    );
  });
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
  const [order, setOrder] = useState<SidebarOrder>(readActiveOrder);
  const migratedRef = useRef(false);

  /** 更新排序：本地立即生效并缓存，登录态异步推服务端（失败不打扰，下次改动再带上） */
  const updateOrder = (mutate: (prev: SidebarOrder) => SidebarOrder) => {
    setOrder((prev) => {
      const next = mutate(prev);
      const vault = localMode ? getActiveVault() : null;
      if (vault) vault.saveOrder(next);
      else writeLocalOrder(next);
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
      const next = localMode
        ? listLocalDocs()
        : loggedIn || offlineAuthed
          ? mergedCloudList()
          : null;
      // 内容没变就复用旧引用：DOCS_CHANGED 广播比实际变化频繁，
      // 空换新数组会打穿侧栏树/筛选的所有 useMemo 引发全树重渲染
      if (next) setDocs((prev) => (prev && sameDocList(prev, next) ? prev : next));
    };
    window.addEventListener(DOCS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DOCS_CHANGED_EVENT, refresh);
  }, [loggedIn, offlineAuthed, localMode]);

  // 本地后端被换掉（打开/关闭 Vault）：文章、分类、排序全是另一个库的，整份重读
  useEffect(() => {
    if (!localMode) return;
    const reload = () => {
      setDocs(listLocalDocs());
      setCustomCats(listLocalCats());
      setOrder(readActiveOrder());
    };
    window.addEventListener(LOCAL_BACKEND_CHANGED_EVENT, reload);
    return () => window.removeEventListener(LOCAL_BACKEND_CHANGED_EVENT, reload);
  }, [localMode]);

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

  // 同步引擎：每轮完成后刷新列表；云端为空且编辑器里有未登录时写的稿子，就把它搬上云
  //（欢迎稿由服务端在账号创建时生成一次，这里不补：删光文章的老用户不该每次登录都多一篇）
  useEffect(() => {
    if (!loggedIn && !offlineAuthed) return;
    if (loggedIn) setWasAuthed();
    const refresh = () => {
      setDocs(mergedCloudList());
      if (
        loggedIn &&
        !migratedRef.current &&
        listMirrorDocs().length === 0 &&
        // 只看浏览器后端：Vault 里有文件不代表要往云端搬
        getBrowserBackend().listDocs().length === 0
      ) {
        migratedRef.current = true;
        const s = useStore.getState();
        const hasLocalWork =
          s.docId === null && s.content.trim() && s.content !== DEFAULT_MARKDOWN;
        if (!hasLocalWork) return;
        void fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: s.title, content: s.content }),
        })
          .then((res) => {
            if (res.ok) {
              toast("本地文稿已同步到云端", "success");
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

  // 回收站列表（进入回收站时拉取）：本地模式读 Vault 的 .trash/，登录态问服务端
  useEffect(() => {
    if (activeCat !== TRASH || !localMode) return;
    const refresh = () => {
      const vault = getActiveVault();
      // 浏览器存储没有回收站（删除即删除），列表留空由 DocListStates 出空文案
      setTrashDocs(vault ? vault.listTrash() : []);
    };
    // effect 里不能同步 setState（react-hooks/set-state-in-effect），推到微任务
    queueMicrotask(refresh);
    window.addEventListener(DOCS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DOCS_CHANGED_EVENT, refresh);
  }, [activeCat, localMode]);

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
