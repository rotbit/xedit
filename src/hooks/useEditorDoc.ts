"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useStore } from "@/store/useStore";
import { toast } from "@/components/Toast";
import {
  isLocalId,
  listLocalDocs,
  getLocalDocContent,
  DOC_REPLACED_EVENT,
} from "@/lib/localDocs";
import { prefetchAttachments } from "@/lib/localBackend/attachmentUrls";
import {
  getMirrorMeta,
  getMirrorContent,
  applyServerDoc,
  removeMirrorDoc,
} from "@/lib/docStore";
import { getSavedDocument, rememberSavedDocument, hasPendingContent } from "@/lib/editorPersistence";
import { useEditorSave } from "@/hooks/useEditorSave";
import { useEditorSettings } from "@/hooks/useEditorSettings";

/** 回到前台的校新节流：来回切标签页不该反复打接口 */
const REFRESH_MIN_INTERVAL = 3000;

/**
 * 校新提示的驻留时长。内容被云端版本替换是「顺带发生的事」，不值得弹 toast 挡视线，
 * 只在状态行（已保存 / 已同步云端 那一格）短暂换成提示文案再回落。
 * 需与 globals.css 里 .sync-hint 动画时长保持一致，淡出正好接上文案切回。
 */
const REFRESH_HINT_MS = 4000;

/**
 * 文档会话入口：负责装载和后台校新，保存与偏好同步由独立 hook 管理。
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

  /** 已直接沿用 store 内容的文档，防止 effect 重跑时重复装载打断输入 */
  const adoptedRef = useRef<string | null>(null);
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
      rememberSavedDocument({
        docId: doc.id,
        title: doc.title,
        content: doc.content,
        category: doc.category ?? "未分类",
      });
      now.setDoc({ id: doc.id, title: doc.title, content: doc.content });
      now.setCategory(doc.category ?? "未分类");
      now.setSaveState("saved");
      setDocVersion((v) => v + 1);
      showRefreshHint();
    } catch {
      // 网络抖动等：保持现有内容，下次触发再试
    }
  }, [showRefreshHint]);

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
      hasPendingContent(routeDocId, useStore.getState().content)
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
      // 会话状态从 loading 落定时 effect 会重跑，靠落盘基准防止重复装载打断输入。
      // 落盘基准跨 mount 存活，故还要确认 store 确实持有这篇，否则会漏装载。
      if (getSavedDocument().docId === routeDocId && useStore.getState().docId === routeDocId)
        return;
      const meta = listLocalDocs().find((d) => d.id === routeDocId);
      const content = getLocalDocContent(routeDocId);
      if (!meta || content === null) {
        toast("本地文章不存在", "error");
        router.replace("/");
        return;
      }
      rememberSavedDocument({
        docId: routeDocId,
        title: meta.title,
        content,
        category: meta.category ?? "未分类",
      });
      const s = useStore.getState();
      s.setDoc({ id: routeDocId, title: meta.title, content });
      s.setCategory(meta.category ?? "未分类");
      s.setSaveState("local");
      prefetchAttachments(content); // 磁盘文库的图片先读起来，少几帧空图
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
      rememberSavedDocument({
        docId: routeDocId,
        title: mirrorMeta.title,
        content: mirrorContent,
        category: mirrorMeta.category ?? "未分类",
      });
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
      rememberSavedDocument({
        docId: doc.id,
        title: doc.title,
        content: doc.content,
        category: doc.category ?? "未分类",
      });
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

  // 当前文档在外部被改动、内容已由 useVaultWatch 换进 store：重挂载编辑器接上新内容
  useEffect(() => {
    const onReplaced = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id !== useStore.getState().docId) return;
      prefetchAttachments(useStore.getState().content);
      setDocVersion((v) => v + 1);
    };
    window.addEventListener(DOC_REPLACED_EVENT, onReplaced);
    return () => window.removeEventListener(DOC_REPLACED_EVENT, onReplaced);
  }, []);

  useEditorSettings(loggedIn);
  useEditorSave();

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
