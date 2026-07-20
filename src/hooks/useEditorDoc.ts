"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useStore } from "@/store/useStore";
import { toast } from "@/components/Toast";
import { isLocalId, listLocalDocs, getLocalDocContent, updateLocalDoc } from "@/lib/localDocs";
import {
  getMirrorMeta,
  getMirrorContent,
  saveMirrorLocal,
  applyServerDoc,
  removeMirrorDoc,
} from "@/lib/docStore";
import { pushMirrorDoc } from "@/lib/sync";

/**
 * 编辑页的文档装载与自动保存。
 * routeDocId 为 null 表示本地文稿模式（未登录直接写作）。
 */
export function useEditorDoc(routeDocId: string | null) {
  const { status } = useSession();
  const loggedIn = status === "authenticated";
  const router = useRouter();

  /** 文档装载完成的标识，编辑器以它为 key 重建 */
  const [docVersion, setDocVersion] = useState(0);
  const [loading, setLoading] = useState(routeDocId !== null);
  const [reloadTick, setReloadTick] = useState(0);

  const settingsLoadedRef = useRef(false);
  /** 已直接沿用 store 内容的文档，防止 effect 重跑时重复装载打断输入 */
  const adoptedRef = useRef<string | null>(null);
  const idleVersionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<{
    docId: string | null;
    title: string;
    content: string;
    category: string;
  }>({ docId: null, title: "", content: "", category: "" });

  // 停止编辑 5 分钟后，把当前内容定格为一个版本（页面关闭时由服务端在下次保存时兜底）
  const scheduleIdleVersion = (id: string) => {
    if (idleVersionTimerRef.current) clearTimeout(idleVersionTimerRef.current);
    idleVersionTimerRef.current = setTimeout(() => {
      void fetch(`/api/documents/${id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "auto" }),
      }).catch(() => undefined);
    }, 5 * 60_000);
  };

  useEffect(() => {
    return () => {
      if (idleVersionTimerRef.current) clearTimeout(idleVersionTimerRef.current);
    };
  }, []);

  // Cmd+S：立即保存并手动存档一个版本
  const saveNowRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    saveNowRef.current = async () => {
    const s = useStore.getState();
    if (isLocalId(s.docId)) {
      try {
        updateLocalDoc(s.docId!, { title: s.title, content: s.content, category: s.category });
        lastSavedRef.current = {
          docId: s.docId,
          title: s.title,
          content: s.content,
          category: s.category,
        };
        s.setSaveState("local");
        toast("已保存到本地", "success");
      } catch {
        s.setSaveState("error");
        toast("保存失败：浏览器存储空间不足", "error");
      }
      return;
    }
    if (!s.docId) {
      toast("本地文稿已实时保存", "success");
      return;
    }
    // 云端文档：先落本地镜像（离线也保得住），再尝试推送
    saveMirrorLocal(s.docId, { title: s.title, content: s.content, category: s.category });
    lastSavedRef.current = {
      docId: s.docId,
      title: s.title,
      content: s.content,
      category: s.category,
    };
    if (!navigator.onLine) {
      s.setSaveState("pending");
      toast("已存本地，联网后自动同步", "success");
      return;
    }
    s.setSaveState("saving");
    const pushed = await pushMirrorDoc(s.docId);
    if (!pushed) {
      useStore.getState().setSaveState("pending");
      toast("云端暂不可达，已存本地稍后自动同步", "error");
      return;
    }
    try {
      const ver = await fetch(`/api/documents/${s.docId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "manual" }),
      });
      const data = await ver.json().catch(() => ({}));
      useStore.getState().setSaveState("saved");
      toast(data.created ? "已保存并存档版本" : "已保存（内容与最近版本相同）", "success");
      } catch {
        useStore.getState().setSaveState("saved");
        toast("已同步云端，版本存档失败", "error");
      }
    };
  });

  useEffect(() => {
    const handler = () => void saveNowRef.current();
    window.addEventListener("xedit:save-now", handler);
    return () => window.removeEventListener("xedit:save-now", handler);
  }, []);

  // —— 装载文档 ——
  useEffect(() => {
    if (!routeDocId) {
      // 本地文稿模式：沿用持久化的本地内容
      const s = useStore.getState();
      s.setDoc({ id: null, title: s.title, content: s.content });
      s.setCategory("未分类");
      s.setSaveState("local");
      return;
    }
    // 会话状态落定等原因导致 effect 重跑时，已装载的文档不重复装载（防止打断输入）
    if (reloadTick === 0 && adoptedRef.current === routeDocId) return;
    // 阅读视图 ↔ 编辑页互切时 store 已持有该文档的最新内容（含未落盘的防抖编辑），
    // 直接沿用避免旧数据覆盖；lastSavedRef 留空，随后的自动保存会把待存内容刷下去
    if (reloadTick === 0 && useStore.getState().docId === routeDocId) {
      adoptedRef.current = routeDocId;
      queueMicrotask(() => {
        setDocVersion((v) => v + 1);
        setLoading(false);
      });
      return;
    }
    if (isLocalId(routeDocId)) {
      // 本地文档：不依赖会话状态，直接从本地库装载；
      // 会话状态从 loading 落定时 effect 会重跑，靠 lastSavedRef 防止重复装载打断输入
      if (lastSavedRef.current.docId === routeDocId) return;
      const meta = listLocalDocs().find((d) => d.id === routeDocId);
      const content = getLocalDocContent(routeDocId);
      if (!meta || content === null) {
        toast("本地文章不存在", "error");
        router.replace("/");
        return;
      }
      lastSavedRef.current = {
        docId: routeDocId,
        title: meta.title,
        content,
        category: meta.category ?? "未分类",
      };
      const s = useStore.getState();
      s.setDoc({ id: routeDocId, title: meta.title, content });
      s.setCategory(meta.category ?? "未分类");
      s.setSaveState("local");
      queueMicrotask(() => {
        setDocVersion((v) => v + 1);
        setLoading(false);
      });
      return;
    }
    // —— 云端文档：镜像优先 ——
    // 有镜像立即装载（秒开、离线可用、无需会话），联网时后台校新
    let cancelled = false;
    const mirrorMeta = reloadTick === 0 ? getMirrorMeta(routeDocId) : null;
    const mirrorContent = mirrorMeta ? getMirrorContent(routeDocId) : null;
    if (mirrorMeta && mirrorContent !== null) {
      adoptedRef.current = routeDocId;
      lastSavedRef.current = {
        docId: routeDocId,
        title: mirrorMeta.title,
        content: mirrorContent,
        category: mirrorMeta.category ?? "未分类",
      };
      const s = useStore.getState();
      s.setDoc({ id: routeDocId, title: mirrorMeta.title, content: mirrorContent });
      s.setCategory(mirrorMeta.category ?? "未分类");
      s.setSaveState(mirrorMeta.dirty ? "pending" : "saved");
      queueMicrotask(() => {
        setDocVersion((v) => v + 1);
        setLoading(false);
      });
      // 后台校新：服务端更新、且用户尚未开始编辑时才替换（本地优先）
      if (navigator.onLine && !mirrorMeta.dirty) {
        void (async () => {
          try {
            const res = await fetch(`/api/documents/${routeDocId}`);
            if (cancelled || !res.ok) return;
            const doc = await res.json();
            if (cancelled) return;
            if (new Date(doc.updatedAt).getTime() <= new Date(mirrorMeta.updatedAt).getTime())
              return;
            const cur = useStore.getState();
            if (
              cur.docId !== routeDocId ||
              cur.content !== mirrorContent ||
              cur.title !== mirrorMeta.title
            )
              return;
            applyServerDoc(doc);
            lastSavedRef.current = {
              docId: doc.id,
              title: doc.title,
              content: doc.content,
              category: doc.category ?? "未分类",
            };
            cur.setDoc({ id: doc.id, title: doc.title, content: doc.content });
            cur.setCategory(doc.category ?? "未分类");
            cur.setSaveState("saved");
            setDocVersion((v) => v + 1);
          } catch {
            // 网络抖动等，保持镜像内容即可
          }
        })();
      }
      return () => {
        cancelled = true;
      };
    }

    // 无镜像：需要网络与登录（首次打开该文档，顺手落镜像供之后离线用）
    if (status === "loading") return;
    if (status === "unauthenticated") {
      toast("请先登录后再打开云端文章", "error");
      router.replace("/");
      return;
    }
    if (!navigator.onLine) {
      toast("此文章尚未离线缓存，联网后打开一次即可离线使用", "error");
      router.replace("/");
      return;
    }

    void (async () => {
      const res = await fetch(`/api/documents/${routeDocId}`).catch(() => null);
      if (cancelled) return;
      if (!res || !res.ok) {
        toast("文章不存在或无权限", "error");
        router.replace("/");
        return;
      }
      const doc = await res.json();
      if (cancelled) return;
      // 版本回滚等强制重拉的场景：先清镜像 dirty 再落库，避免旧的待推内容覆盖回滚结果
      removeMirrorDoc(doc.id);
      applyServerDoc(doc);
      adoptedRef.current = doc.id;
      lastSavedRef.current = {
        docId: doc.id,
        title: doc.title,
        content: doc.content,
        category: doc.category ?? "未分类",
      };
      useStore.getState().setDoc({ id: doc.id, title: doc.title, content: doc.content });
      useStore.getState().setCategory(doc.category ?? "未分类");
      useStore.getState().setSaveState("saved");
      setDocVersion((v) => v + 1);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [routeDocId, status, router, reloadTick]);

  // —— 登录后拉取云端偏好（主题/自定义CSS/外链设置） ——
  useEffect(() => {
    if (!loggedIn || settingsLoadedRef.current) return;
    settingsLoadedRef.current = true;
    void (async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const settings = await res.json();
      if (settings) {
        const s = useStore.getState();
        s.setThemeId(settings.themeId);
        s.setCustomCss(settings.customCss);
        s.setLinkFootnote(settings.linkFootnote);
      }
    })();
  }, [loggedIn]);

  // —— 内容/标题自动保存（防抖 800ms，含版本快照） ——
  const title = useStore((s) => s.title);
  const content = useStore((s) => s.content);
  const category = useStore((s) => s.category);
  const docId = useStore((s) => s.docId);

  useEffect(() => {
    if (isLocalId(docId)) {
      const last = lastSavedRef.current;
      if (
        last.docId === docId &&
        last.title === title &&
        last.content === content &&
        last.category === category
      )
        return;
      const timer = setTimeout(() => {
        try {
          updateLocalDoc(docId!, { title, content, category });
          lastSavedRef.current = { docId, title, content, category };
          useStore.getState().setSaveState("local");
        } catch {
          useStore.getState().setSaveState("error");
        }
      }, 500);
      return () => clearTimeout(timer);
    }
    if (!docId) {
      useStore.getState().setSaveState("local");
      return;
    }
    const last = lastSavedRef.current;
    if (
      last.docId === docId &&
      last.title === title &&
      last.content === content &&
      last.category === category
    )
      return;

    // 云端文档：先落本地镜像，再尝试推送；离线/失败时保持 dirty 由同步引擎兜底
    const timer = setTimeout(async () => {
      saveMirrorLocal(docId, { title, content, category });
      lastSavedRef.current = { docId, title, content, category };
      if (!navigator.onLine) {
        useStore.getState().setSaveState("pending");
        return;
      }
      useStore.getState().setSaveState("saving");
      const pushed = await pushMirrorDoc(docId);
      if (pushed) {
        useStore.getState().setSaveState("saved");
        scheduleIdleVersion(docId);
      } else {
        useStore.getState().setSaveState(navigator.onLine ? "error" : "pending");
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [docId, title, content, category]);

  // —— 偏好设置自动同步（防抖 1s） ——
  const themeId = useStore((s) => s.themeId);
  const customCss = useStore((s) => s.customCss);
  const linkFootnote = useStore((s) => s.linkFootnote);

  useEffect(() => {
    if (!loggedIn || !settingsLoadedRef.current) return;
    const timer = setTimeout(() => {
      void fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, customCss, linkFootnote }),
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [loggedIn, themeId, customCss, linkFootnote]);

  return {
    loggedIn,
    sessionStatus: status,
    docVersion,
    loading,
    /** 重新从云端拉取当前文档（版本回滚后使用） */
    reload: () => setReloadTick((t) => t + 1),
  };
}
