"use client";

// Connection and sync state for the Feishu dialog: moved out of FeishuDialog, centralizing app credentials, OAuth connection,
// wiki space list and starting syncs; the component keeps only rendering

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ackReconnect,
  clearFeishuSyncProgress,
  isFeishuSyncing,
  startFeishuSync,
  useFeishuSync,
} from "@/hooks/useFeishuSync";
import { t, tk } from "@/i18n/t";
import { toast } from "../Toast";

/** The callback URL is fixed per deployment, so there's nothing to subscribe to and subscribe returns a no-op cleanup */
const subscribeNoop = () => () => {};
const getCallbackUrl = () => `${window.location.origin}/api/feishu/callback`;

/** Mask: sentinel sent back when the App Secret isn't changed; the server recognizes it and keeps the original value */
const KEY_MASK = "__keep__";

interface ConnectionView {
  hasApp: boolean;
  appId: string;
  secretLast4: string;
  connected: boolean;
  feishuName: string;
  spaceId: string;
  spaceName: string;
  lastSyncAt: string | null;
}

interface SpaceOption {
  id: string;
  name: string;
}

/**
 * Feishu wiki import: each account configures its own Feishu app credentials, connects (user-identity OAuth), then
 * picks a wiki space to sync incrementally in batches into xedit articles. Sync is idempotent — documents unchanged on the Feishu side are skipped entirely.
 */
export function useFeishuConnection(onSynced: () => void) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [conn, setConn] = useState<ConnectionView | null>(null);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [secretEdited, setSecretEdited] = useState(false);
  const [appDirty, setAppDirty] = useState(false);
  const [savingApp, setSavingApp] = useState(false);
  const [spaces, setSpaces] = useState<SpaceOption[] | null>(null);
  const [spaceId, setSpaceId] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  // The sync loop and progress run at module level: closing the dialog doesn't interrupt them, and reopening picks back up
  const sync = useFeishuSync();
  const syncing = sync.syncing;
  const progress = sync.progress;
  // Refocusing refetches state; don't wipe the user's unsaved credential draft when it does
  const appDirtyRef = useRef(false);
  // origin only exists in the browser; the server snapshot returns an empty string to avoid a hydration mismatch
  const callbackUrl = useSyncExternalStore(subscribeNoop, getCallbackUrl, () => "");

  const markAppDirty = useCallback(() => {
    appDirtyRef.current = true;
    setAppDirty(true);
  }, []);

  const loadConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/feishu/connection");
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      const data: ConnectionView = await res.json();
      setConn(data);
      // With an unsaved draft, only update connection state and leave the inputs to the user (switching tabs to copy the Secret triggers this)
      if (!appDirtyRef.current) {
        setAppId(data.appId);
        setAppSecret("");
        setSecretEdited(false);
      }
      if (data.connected) setSpaceId((prev) => prev || data.spaceId);
    } catch {
      toast(t("加载飞书连接状态失败"), "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadConnection();
    })();
  }, [loadConnection]);

  // The auth popup sends a postMessage when done; if the user closes it manually, a refresh on refocus covers it
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "xedit-feishu-connected") {
        ackReconnect();
        void loadConnection();
      }
    };
    const onFocus = () => {
      if (!isFeishuSyncing()) void loadConnection();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadConnection]);

  // When authorization is invalid (refresh_token expired/revoked), go back to the 「连接飞书」 (Connect Feishu) state to prompt re-authorization
  const handleReconnect = useCallback(() => {
    setConn((c) => (c ? { ...c, connected: false } : c));
    setSpaces(null);
  }, []);

  // When the sync loop finds authorization invalid it leaves a flag in the store (the dialog may have been closed then);
  // fold it into the "connected" check here; the postMessage callback clears it after successful re-authorization
  const connected = Boolean(conn?.connected) && !sync.reconnectRequired;

  // When connected, fetch the list of selectable wiki spaces
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/feishu/spaces");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          if (data.needReconnect) handleReconnect();
          throw new Error(data.error ?? tk("加载失败"));
        }
        setSpaces(Array.isArray(data.spaces) ? data.spaces : []);
      } catch (e) {
        if (!cancelled) {
          setSpaces([]);
          // Server error messages are in the original Chinese; t() translates dictionary hits and shows the rest as-is
          toast(e instanceof Error ? t(e.message) : t("加载知识空间失败"), "error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, handleReconnect]);

  const saveApp = async () => {
    if (!appId.trim()) {
      toast(t("请填写 App ID"), "error");
      return;
    }
    setSavingApp(true);
    try {
      const res = await fetch("/api/feishu/connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId,
          appSecret: secretEdited ? appSecret : KEY_MASK,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? tk("保存失败"));
      setConn(data);
      setAppId(data.appId);
      setAppSecret("");
      setSecretEdited(false);
      appDirtyRef.current = false;
      setAppDirty(false);
      toast(t("应用凭证已保存"), "success");
    } catch (e) {
      toast(e instanceof Error ? t(e.message) : t("保存失败"), "error");
    } finally {
      setSavingApp(false);
    }
  };

  const connect = () => {
    window.open(
      "/api/feishu/authorize",
      "xedit-feishu-auth",
      "width=520,height=680,menubar=no,toolbar=no"
    );
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/feishu/connection", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setConn((c) => (c ? { ...c, connected: false, feishuName: "" } : c));
      setSpaces(null);
      clearFeishuSyncProgress();
      toast(t("已断开授权（应用凭证、已导入文章与同步记录都保留）"), "success");
    } catch {
      toast(t("断开失败"), "error");
    } finally {
      setDisconnecting(false);
    }
  };

  const runSync = () => {
    const space = spaces?.find((s) => s.id === spaceId);
    if (!space) {
      toast(t("请先选择要导入的知识库"), "error");
      return;
    }
    // The completion callback works even if the dialog is closed: onSynced belongs to the outer workspace, and loadConnection is a no-op after unmount
    void startFeishuSync(space, () => {
      onSynced();
      void loadConnection();
    });
  };

  return {
    loading,
    needLogin,
    conn,
    appId,
    setAppId,
    appSecret,
    setAppSecret,
    secretEdited,
    setSecretEdited,
    appDirty,
    savingApp,
    spaces,
    spaceId,
    setSpaceId,
    disconnecting,
    sync,
    syncing,
    progress,
    callbackUrl,
    connected,
    markAppDirty,
    saveApp,
    connect,
    disconnect,
    runSync,
  };
}
