"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/** 回到前台的校新节流：来回切标签页不该反复打接口 */
const REFRESH_MIN_INTERVAL = 3000;

/**
 * 校新提示的驻留时长。内容被云端版本替换是「顺带发生的事」，不值得弹 toast 挡视线，
 * 只在状态行（已保存 / 已同步云端 那一格）短暂换成提示文案再回落。
 * 需与 globals.css 里 .sync-hint 动画时长保持一致，淡出正好接上文案切回。
 */
const REFRESH_HINT_MS = 4000;

/**
 * 最后一次落盘的内容基准。模块级而非组件 ref——编辑页重新 mount（工作台/阅读视图互切）后
 * 仍要靠它判断 store 里有没有未落盘的防抖编辑；组件级 ref 会随 mount 清零，
 * 于是一律被当成「有改动」而沿用旧 store，后台已同步到的新内容就被盖了回去。
 */
const lastSaved: {
  current: { docId: string | null; title: string; content: string; category: string };
} = { current: { docId: null, title: "", content: "", category: "" } };

/**
 * store 里是否有尚未落盘的编辑——防抖窗口（800ms）内离开页面就会留下这种内容。
 * 基准优先取 lastSaved（同一页面会话内精确），页面刷新后退化为与镜像内容比对；
 * 两者都拿不到时保守返回 true：宁可不刷新，也不能丢用户刚敲的字。
 */
function hasPendingEdit(id: string): boolean {
  const base = lastSaved.current.docId === id ? lastSaved.current.content : getMirrorContent(id);
  if (base === null) return true;
  return useStore.getState().content !== base;
}

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
  /** 本次会话是否有过成功的云端保存——没有就不必在关页面时请求存档 */
  const savedThisSessionRef = useRef(false);
  /** 上次向服务端校新的时刻，用于节流 */
  const lastRefreshAtRef = useRef(0);

  /** 刚把内容换成云端最新版：状态行显示提示，几秒后自行回落 */
  const [refreshedHint, setRefreshedHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showRefreshHint = useCallback(() => {
    setRefreshedHint(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setRefreshedHint(false), REFRESH_HINT_MS);
  }, []);
  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  /**
   * 从云端校新当前文档：仅当镜像不 dirty（无未推送改动）且 store 与镜像一致
   * （无未落盘编辑）时才替换，本地一律优先。装载后、回到前台、网络恢复三处共用。
   */
  const refreshFromServer = useCallback(async (id: string) => {
    if (!id || isLocalId(id) || !navigator.onLine) return;
    const meta = getMirrorMeta(id);
    const mirrored = meta ? getMirrorContent(id) : null;
    if (!meta || mirrored === null || meta.dirty) return;
    const before = useStore.getState();
    if (before.docId !== id || before.content !== mirrored || before.title !== meta.title) return;
    lastRefreshAtRef.current = Date.now();
    try {
      const res = await fetch(`/api/documents/${id}`);
      if (!res.ok) return;
      const doc = await res.json();
      if (new Date(doc.updatedAt).getTime() <= new Date(meta.updatedAt).getTime()) return;
      // 请求往返期间用户可能已开始打字或切走，写回 store 前再核一次
      const now = useStore.getState();
      if (now.docId !== id || now.content !== mirrored || now.title !== meta.title) return;
      applyServerDoc(doc);
      lastSaved.current = {
        docId: doc.id,
        title: doc.title,
        content: doc.content,
        category: doc.category ?? "未分类",
      };
      now.setDoc({ id: doc.id, title: doc.title, content: doc.content });
      now.setCategory(doc.category ?? "未分类");
      now.setSaveState("saved");
      setDocVersion((v) => v + 1);
      showRefreshHint();
    } catch {
      // 网络抖动等：保持现有内容，下次触发再试
    }
  }, [showRefreshHint]);

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

  // 关闭 / 离开页面：空闲定时器等不到就被销毁了，用 beacon 补一次存档请求
  // （服务端对 auto 有 1 分钟节流与改动量门槛，来回切页不会刷出一堆版本）
  useEffect(() => {
    const flush = () => {
      const id = useStore.getState().docId;
      if (!id || isLocalId(id) || !savedThisSessionRef.current) return;
      if (!navigator.onLine || !navigator.sendBeacon) return;
      navigator.sendBeacon(
        `/api/documents/${id}/versions`,
        new Blob([JSON.stringify({ kind: "auto" })], { type: "application/json" })
      );
      savedThisSessionRef.current = false;
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  // Cmd+S：立即保存并手动存档一个版本
  const saveNowRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    saveNowRef.current = async () => {
    const s = useStore.getState();
    if (isLocalId(s.docId)) {
      try {
        updateLocalDoc(s.docId!, { title: s.title, content: s.content, category: s.category });
        lastSaved.current = {
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
    lastSaved.current = {
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
    // 阅读视图 ↔ 编辑页互切时 store 可能持有未落盘的防抖编辑，这种情况才沿用 store
    // 避免旧数据覆盖，随后的自动保存会把这份待存内容刷下去。
    // 反之（store 与已落盘内容一致）不能沿用——镜像可能刚被后台同步刷新过，
    // 沿用旧 store 会把新内容盖回去，「回工作台再点进来还是旧稿」就是这么来的。
    if (
      reloadTick === 0 &&
      useStore.getState().docId === routeDocId &&
      hasPendingEdit(routeDocId)
    ) {
      adoptedRef.current = routeDocId;
      queueMicrotask(() => {
        setDocVersion((v) => v + 1);
        setLoading(false);
      });
      return;
    }
    if (isLocalId(routeDocId)) {
      // 本地文档：不依赖会话状态，直接从本地库装载；
      // 会话状态从 loading 落定时 effect 会重跑，靠 lastSaved 防止重复装载打断输入。
      // lastSaved 跨 mount 存活，故还要确认 store 确实持有这篇，否则会漏装载。
      if (lastSaved.current.docId === routeDocId && useStore.getState().docId === routeDocId)
        return;
      const meta = listLocalDocs().find((d) => d.id === routeDocId);
      const content = getLocalDocContent(routeDocId);
      if (!meta || content === null) {
        toast("本地文章不存在", "error");
        router.replace("/");
        return;
      }
      lastSaved.current = {
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
      lastSaved.current = {
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
      // 后台校新：服务端更新、且本地无改动时才替换（本地优先）。
      // 与上面的装载一样挪出 effect 同步体，避免装载即触发级联渲染
      queueMicrotask(() => void refreshFromServer(routeDocId));
      return;
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
      lastSaved.current = {
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
  }, [routeDocId, status, router, reloadTick, refreshFromServer]);

  // —— 回到前台 / 网络恢复时校新 ——
  // 没有 WebSocket 推送，这是 MCP、其他设备或另一个标签页改过的内容进到当前页的唯一时机。
  useEffect(() => {
    if (!routeDocId || isLocalId(routeDocId)) return;
    const tryRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL) return;
      void refreshFromServer(routeDocId);
    };
    document.addEventListener("visibilitychange", tryRefresh);
    window.addEventListener("online", tryRefresh);
    return () => {
      document.removeEventListener("visibilitychange", tryRefresh);
      window.removeEventListener("online", tryRefresh);
    };
  }, [routeDocId, refreshFromServer]);

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
      const last = lastSaved.current;
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
          lastSaved.current = { docId, title, content, category };
          useStore.getState().setSaveState("local");
        } catch {
          useStore.getState().setSaveState("error");
        }
      }, 500);
      return () => clearTimeout(timer);
    }
    if (!docId) {
      // 按实时状态判断，不能用捕获值：装载 effect 会在同一提交里先设好 docId，
      // 而这里拿到的还是上次渲染的 null，照它写会把刚设好的「已同步云端」冲成「仅保存在本地」
      if (!useStore.getState().docId) useStore.getState().setSaveState("local");
      return;
    }
    const last = lastSaved.current;
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
      lastSaved.current = { docId, title, content, category };
      if (!navigator.onLine) {
        useStore.getState().setSaveState("pending");
        return;
      }
      useStore.getState().setSaveState("saving");
      const pushed = await pushMirrorDoc(docId);
      if (pushed) {
        useStore.getState().setSaveState("saved");
        savedThisSessionRef.current = true;
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
    /** 刚拉到云端新内容，状态行据此短暂提示（替代弹窗） */
    refreshedHint,
    /** 重新从云端拉取当前文档（版本回滚后使用） */
    reload: () => setReloadTick((t) => t + 1),
  };
}
