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
  const lastSavedRef = useRef<{ docId: string | null; title: string; content: string }>({
    docId: null,
    title: "",
    content: "",
  });

  // —— 装载文档 ——
  useEffect(() => {
    if (!routeDocId) {
      // 本地文稿模式：沿用持久化的本地内容
      const s = useStore.getState();
      s.setDoc({ id: null, title: s.title, content: s.content });
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
      lastSavedRef.current = { docId: doc.id, title: doc.title, content: doc.content };
      useStore.getState().setDoc({ id: doc.id, title: doc.title, content: doc.content });
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
  const docId = useStore((s) => s.docId);

  useEffect(() => {
    if (!loggedIn || !docId) {
      useStore.getState().setSaveState("local");
      return;
    }
    const last = lastSavedRef.current;
    if (last.docId === docId && last.title === title && last.content === content) return;

    const timer = setTimeout(async () => {
      useStore.getState().setSaveState("saving");
      try {
        const res = await fetch(`/api/documents/${docId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content }),
        });
        if (!res.ok) throw new Error(String(res.status));
        lastSavedRef.current = { docId, title, content };
        useStore.getState().setSaveState("saved");
      } catch {
        useStore.getState().setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [loggedIn, docId, title, content]);

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
