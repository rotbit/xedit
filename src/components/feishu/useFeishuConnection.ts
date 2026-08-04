"use client";

// 飞书对话框的连接与同步状态：从 FeishuDialog 搬出，集中管理应用凭证、OAuth 连接、
// 知识空间列表与同步发起，组件里只留渲染

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ackReconnect,
  clearFeishuSyncProgress,
  isFeishuSyncing,
  startFeishuSync,
  useFeishuSync,
} from "@/hooks/useFeishuSync";
import { toast } from "../Toast";

/** 回调地址随站点部署固定，订阅无需做任何事（与 McpDialog 同款写法） */
const subscribeNoop = () => () => {};
const getCallbackUrl = () => `${window.location.origin}/api/feishu/callback`;

/** 掩码：不改动 App Secret 时回传的哨兵值，服务端识别后保留原值 */
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
 * 飞书知识库导入：每个账号配置自己的飞书应用凭证，连接（用户身份 OAuth）后
 * 选择知识空间分批增量同步为 xedit 文章。同步幂等——飞书侧没改动的文档整篇跳过。
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
  // 同步循环与进度在模块层跑：关掉对话框不打断，重开还能接上
  const sync = useFeishuSync();
  const syncing = sync.syncing;
  const progress = sync.progress;
  // 焦点回落会重新拉状态，此时别把用户还没保存的凭证草稿冲掉
  const appDirtyRef = useRef(false);
  // origin 只有浏览器里才有；服务端快照给空串，避免水合不一致
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
      // 有未保存的草稿就只更新连接态，输入框留给用户（切标签复制 Secret 时会触发这里）
      if (!appDirtyRef.current) {
        setAppId(data.appId);
        setAppSecret("");
        setSecretEdited(false);
      }
      if (data.connected) setSpaceId((prev) => prev || data.spaceId);
    } catch {
      toast("加载飞书连接状态失败", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadConnection();
    })();
  }, [loadConnection]);

  // 授权弹窗完成后会 postMessage 通知；用户手动关掉弹窗则靠焦点回落兜底刷新
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

  // 授权失效（refresh_token 过期/被撤销）时回到「连接飞书」状态，引导重新授权
  const handleReconnect = useCallback(() => {
    setConn((c) => (c ? { ...c, connected: false } : c));
    setSpaces(null);
  }, []);

  // 同步循环发现授权失效时在 store 里留了标记（对话框可能当时是关着的），
  // 这里把它并进「已连接」判定，重新授权成功后由 postMessage 回调清除
  const connected = Boolean(conn?.connected) && !sync.reconnectRequired;

  // 已连接时拉取可选的知识空间列表
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
          throw new Error(data.error ?? "加载失败");
        }
        setSpaces(Array.isArray(data.spaces) ? data.spaces : []);
      } catch (e) {
        if (!cancelled) {
          setSpaces([]);
          toast(e instanceof Error ? e.message : "加载知识空间失败", "error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, handleReconnect]);

  const saveApp = async () => {
    if (!appId.trim()) {
      toast("请填写 App ID", "error");
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
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      setConn(data);
      setAppId(data.appId);
      setAppSecret("");
      setSecretEdited(false);
      appDirtyRef.current = false;
      setAppDirty(false);
      toast("应用凭证已保存", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存失败", "error");
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
      toast("已断开授权（应用凭证、已导入文章与同步记录都保留）", "success");
    } catch {
      toast("断开失败", "error");
    } finally {
      setDisconnecting(false);
    }
  };

  const runSync = () => {
    const space = spaces?.find((s) => s.id === spaceId);
    if (!space) {
      toast("请先选择要导入的知识库", "error");
      return;
    }
    // 完成回调即使对话框已关闭也有效：onSynced 属于外层工作台，loadConnection 卸载后是空操作
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
