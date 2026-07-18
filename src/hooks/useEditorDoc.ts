"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useStore } from "@/store/useStore";
import { toast } from "@/components/Toast";

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
      });
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
    if (!loggedIn || !s.docId) {
      toast("本地文稿已实时保存", "success");
      return;
    }
    s.setSaveState("saving");
    try {
      const res = await fetch(`/api/documents/${s.docId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: s.title, content: s.content, category: s.category }),
      });
      if (!res.ok) throw new Error(String(res.status));
      lastSavedRef.current = {
        docId: s.docId,
        title: s.title,
        content: s.content,
        category: s.category,
      };
      const ver = await fetch(`/api/documents/${s.docId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "manual" }),
      });
      const data = await ver.json().catch(() => ({}));
      s.setSaveState("saved");
      toast(data.created ? "已保存并存档版本" : "已保存（内容与最近版本相同）", "success");
      } catch {
        useStore.getState().setSaveState("error");
        toast("保存失败，请检查网络或登录状态", "error");
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
    if (status === "loading") return;
    if (status === "unauthenticated") {
      toast("请先登录后再打开云端文章", "error");
      router.replace("/");
      return;
    }

    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/documents/${routeDocId}`);
      if (cancelled) return;
      if (!res.ok) {
        toast("文章不存在或无权限", "error");
        router.replace("/");
        return;
      }
      const doc = await res.json();
      if (cancelled) return;
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
    if (!loggedIn || !docId) {
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

    const timer = setTimeout(async () => {
      useStore.getState().setSaveState("saving");
      try {
        const res = await fetch(`/api/documents/${docId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content, category }),
        });
        if (!res.ok) throw new Error(String(res.status));
        lastSavedRef.current = { docId, title, content, category };
        useStore.getState().setSaveState("saved");
        scheduleIdleVersion(docId);
      } catch {
        useStore.getState().setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [loggedIn, docId, title, content, category]);

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
