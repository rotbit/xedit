"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BookDown, Check, ChevronDown, Copy, Loader2, Unlink, X } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import {
  ackReconnect,
  cancelFeishuSync,
  clearFeishuSyncProgress,
  isFeishuSyncing,
  startFeishuSync,
  useFeishuSync,
} from "@/hooks/useFeishuSync";
import { toast } from "./Toast";
import { openAuth } from "./AuthDialog";

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

const btnPrimary =
  "flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-deep)] disabled:opacity-60";
const fieldCls =
  "h-9 w-full rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]";
const labelCls = "mb-1 mt-3 block text-[12px] text-[var(--ink-soft)]";
const codeCls = "mx-0.5 [font-family:var(--mono)]";

/** 使用说明：折叠收纳在对话框底部，配置前后都可查看 */
function Guide({ callbackUrl, defaultOpen }: { callbackUrl: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("复制失败", "error");
    }
  };

  return (
    <section className="rounded-md border border-[var(--hairline)] bg-[var(--paper)]">
      <button
        className="flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-[12.5px] font-medium text-[var(--ink)]"
        onClick={() => setOpen((v) => !v)}
      >
        使用说明
        <ChevronDown
          size={14}
          className={`text-[var(--ink-faint)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="border-t border-[var(--hairline)] px-4 py-3 text-[12px] leading-5 text-[var(--ink-soft)]">
          <p className="mb-1 font-medium text-[var(--ink)]">首次配置：创建自己的飞书应用（一次即可）</p>
          <ol className="mb-3 list-decimal space-y-1.5 pl-4">
            <li>
              到{" "}
              <a
                className="text-[var(--accent)] hover:underline"
                href="https://open.feishu.cn"
                target="_blank"
                rel="noreferrer"
              >
                open.feishu.cn
              </a>{" "}
              创建「企业自建应用」，在「应用能力」里开启<b>网页应用</b>；
            </li>
            <li>
              「权限管理」里申请 4 个<b>用户身份</b>权限：
              <code className={codeCls}>wiki:wiki:readonly</code>、
              <code className={codeCls}>docx:document:readonly</code>、
              <code className={codeCls}>docs:document.media:download</code>、
              <code className={codeCls}>offline_access</code>（都是免审权限，开通即生效）。
              如需把 xedit 文章<b>推送/写回</b>飞书，再加 3 个：
              <code className={codeCls}>wiki:wiki</code>、
              <code className={codeCls}>docx:document</code>、
              <code className={codeCls}>docs:document.media:upload</code>（同样免审，
              首次推送时会引导你重新授权）；
            </li>
            <li>
              「安全设置 → 重定向 URL」里添加：
              <span className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] px-2.5 py-1.5 text-[11.5px] [font-family:var(--mono)]">
                  {callbackUrl}
                </code>
                <button
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[var(--hairline-strong)] text-[var(--ink-soft)] hover:bg-[var(--panel)]"
                  onClick={() => void copyUrl()}
                  title="复制"
                >
                  {copied ? <Check size={14} className="text-[var(--accent)]" /> : <Copy size={14} />}
                </button>
              </span>
            </li>
            <li>创建版本并发布应用（首次配置需要发一次版让应用启用；上面的权限本身开通即生效）；</li>
            <li>把「凭证与基础信息」里的 App ID / App Secret 填到上方并保存。</li>
          </ol>
          <p className="mb-1 font-medium text-[var(--ink)]">日常操作</p>
          <ol className="mb-3 list-decimal space-y-1 pl-4">
            <li>点「连接飞书」，在弹出的飞书官方页面登录并点「授权」，弹窗会自动关闭；</li>
            <li>回到本窗口，在下拉框里选择要导入的知识库；</li>
            <li>
              点「开始同步」。同步期间可以关掉本窗口（完成后会有提示），但请别关闭或刷新页面；
              中断了也没关系，下次同步会跳过没改动的文档、自动续传。之后飞书里有更新，再来点一次即可。
            </li>
          </ol>
          <p className="mb-1 font-medium text-[var(--ink)]">同步规则</p>
          <ul className="space-y-1 pl-1">
            <li>· 知识库目录层级映射为文章分类：飞书知识库/空间名/…</li>
            <li>· 文档里的图片自动转存到你的图片库，不再依赖飞书</li>
            <li>· 重复同步是安全的：没改动的整篇跳过，有改动的更新并保留版本历史</li>
            <li>· 导入的文章移入回收站后不再被同步更新；彻底删除后再次同步会重新导入</li>
            <li>· 文章列表右键「推送到飞书」：已关联的写回原文档（先做冲突检查），
              未关联的在上面选择的知识库根目录新建文档</li>
            <li>· 仅支持新版云文档；电子表格、多维表格、思维笔记等会以占位提示代替</li>
            <li>· 凭证与授权只属于你的账号：App Secret 与 token 均加密保存在服务端</li>
            <li>· 按飞书安全策略，授权满 365 天需重新连接一次</li>
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * 飞书知识库导入：每个账号配置自己的飞书应用凭证，连接（用户身份 OAuth）后
 * 选择知识空间分批增量同步为 xedit 文章。同步幂等——飞书侧没改动的文档整篇跳过。
 */
export function FeishuDialog({
  onClose,
  onSynced,
}: {
  onClose: () => void;
  onSynced: () => void;
}) {
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
  useEscape(onClose);

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

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-[520px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4">
          <span className="flex items-center gap-2 text-[14px] font-medium [font-family:var(--serif)]">
            <BookDown size={15} className="text-[var(--accent)]" />
            飞书知识库导入
          </span>
          <button
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex h-56 items-center justify-center text-[var(--ink-faint)]">
            <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
          </div>
        ) : needLogin ? (
          <div className="flex flex-col items-center gap-4 px-8 py-14 text-center">
            <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
              导入的文章与应用凭证都保存在你的账号下，
              <br />
              请先登录后再连接飞书。
            </p>
            <button
              className={btnPrimary}
              onClick={() => {
                onClose();
                openAuth("login");
              }}
            >
              去登录
            </button>
          </div>
        ) : !conn || !connected ? (
          <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
            {/* 第一步：账号自己的飞书应用凭证 */}
            <section>
              <p className="text-[12px] text-[var(--ink-soft)]">
                ① 应用凭证（每个账号配置自己的，
                <span className="text-[var(--ink-faint)]">创建方法见下方使用说明</span>）
              </p>
              <label className={labelCls}>App ID</label>
              <input
                className={fieldCls}
                value={appId}
                onChange={(e) => {
                  setAppId(e.target.value);
                  markAppDirty();
                }}
                placeholder="cli_ 开头的应用 ID"
              />
              <label className={labelCls}>App Secret</label>
              <input
                className={fieldCls}
                type="password"
                value={appSecret}
                onChange={(e) => {
                  setAppSecret(e.target.value);
                  setSecretEdited(true);
                  markAppDirty();
                }}
                placeholder={
                  conn?.secretLast4
                    ? `已保存 ····${conn.secretLast4}（留空则不修改）`
                    : "应用的 App Secret"
                }
              />
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[11px] text-[var(--ink-faint)]">凭证加密保存在服务端，仅你的账号可用</p>
                <button
                  className={btnPrimary}
                  onClick={() => void saveApp()}
                  disabled={savingApp || !appDirty}
                >
                  {savingApp ? <Loader2 size={13} className="animate-spin" /> : null}
                  {savingApp ? "保存中…" : "保存凭证"}
                </button>
              </div>
            </section>

            {/* 第二步：授权连接 */}
            <section className="flex flex-col items-center gap-2.5 rounded-md border border-dashed border-[var(--hairline-strong)] px-4 py-6 text-center">
              <p className="text-[12px] leading-5 text-[var(--ink-soft)]">
                ② 连接后即可把你有权限的知识库整库导入为文章
              </p>
              <button className={btnPrimary} onClick={connect} disabled={!conn?.hasApp || appDirty}>
                连接飞书
              </button>
              {!conn?.hasApp ? (
                <p className="text-[11px] text-[var(--ink-faint)]">先保存上方应用凭证</p>
              ) : appDirty ? (
                <p className="text-[11px] text-[var(--ink-faint)]">凭证有未保存的修改</p>
              ) : null}
            </section>

            <Guide callbackUrl={callbackUrl} defaultOpen={!conn?.hasApp} />
          </div>
        ) : (
          <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
            <section className="flex items-center gap-3 rounded-md border border-[var(--hairline-strong)] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-[var(--ink)]">
                  已连接飞书{conn.feishuName ? `：${conn.feishuName}` : ""}
                </p>
                {conn.lastSyncAt ? (
                  <p className="text-[11px] text-[var(--ink-faint)]">
                    上次同步 {new Date(conn.lastSyncAt).toLocaleString("zh-CN")}
                  </p>
                ) : null}
              </div>
              <button
                className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-red-600 disabled:opacity-50"
                onClick={() => void disconnect()}
                disabled={disconnecting || syncing}
              >
                {disconnecting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Unlink size={13} />
                )}
                断开
              </button>
            </section>

            <section>
              <p className="mb-1.5 text-[12px] text-[var(--ink-soft)]">选择知识库</p>
              {spaces === null ? (
                <div className="flex h-9 items-center gap-2 text-[12px] text-[var(--ink-faint)]">
                  <Loader2 size={13} className="animate-spin" /> 加载知识空间…
                </div>
              ) : spaces.length === 0 ? (
                <p className="rounded-md border border-dashed border-[var(--hairline-strong)] px-3 py-4 text-center text-[12px] text-[var(--ink-faint)]">
                  没有可访问的知识库
                </p>
              ) : (
                <select
                  className="h-9 w-full cursor-pointer rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] px-2.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                  value={spaceId}
                  onChange={(e) => setSpaceId(e.target.value)}
                  disabled={syncing}
                >
                  <option value="">请选择…</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </section>

            {syncing || progress || sync.error ? (
              <section className="rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-4 py-3 text-[12px] leading-5 text-[var(--ink-soft)]">
                {sync.scanning ? (
                  <p className="flex items-center gap-2">
                    <Loader2 size={13} className="shrink-0 animate-spin text-[var(--accent)]" />
                    正在扫描知识库目录、同步第一批文档…
                  </p>
                ) : progress ? (
                  <>
                    {/* 进度 = 已核对的文档（未变动的跳过也算），分母是库里全部文档 */}
                    <div className="mb-2 flex items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--hairline)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                          style={{
                            width: `${
                              progress.total > 0
                                ? Math.round(
                                    ((progress.total - progress.pending) / progress.total) * 100
                                  )
                                : 100
                            }%`,
                          }}
                        />
                      </div>
                      <span className="shrink-0 text-[11px] text-[var(--ink-faint)] [font-family:var(--mono)]">
                        {progress.total - progress.pending}/{progress.total}
                      </span>
                    </div>
                    <p>
                      新增 {progress.created} · 更新 {progress.updated} · 跳过 {progress.skipped}
                      {syncing ? ` · 待处理 ${progress.pending}` : ""}
                    </p>
                    {syncing && sync.current.length > 0 ? (
                      <p className="mt-1 flex items-center gap-1.5 text-[var(--ink)]">
                        <Loader2 size={12} className="shrink-0 animate-spin text-[var(--accent)]" />
                        <span className="truncate">
                          正在同步：{sync.current[0]}
                          {sync.current.length > 1 ? ` 等 ${sync.current.length} 篇` : ""}
                        </span>
                      </p>
                    ) : null}
                    {syncing && sync.retry ? (
                      <p className="mt-1 flex items-center gap-1.5 text-amber-600/90">
                        <Loader2 size={12} className="shrink-0 animate-spin" />
                        <span className="truncate">
                          连接失败，自动重试中（第 {sync.retry.attempt} 次）：{sync.retry.reason}
                        </span>
                      </p>
                    ) : null}
                    {sync.recent.length > 0 ? (
                      <ul className="mt-1.5 space-y-0.5 text-[var(--ink-faint)]">
                        {sync.recent.slice(0, 4).map((it, i) => (
                          <li key={i} className="truncate">
                            {it.action === "created" ? "新增" : "更新"}：{it.title}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {progress.failed.length > 0 ? (
                      <ul className="mt-1.5 space-y-0.5 text-red-600/90">
                        {progress.failed.slice(0, 5).map((f, i) => (
                          <li key={i} className="truncate">
                            失败：{f.title} — {f.reason}
                          </li>
                        ))}
                        {progress.failed.length > 5 ? (
                          <li>…另有 {progress.failed.length - 5} 篇失败</li>
                        ) : null}
                      </ul>
                    ) : null}
                  </>
                ) : null}
                {!syncing && sync.error ? (
                  <p className={`text-red-600/90 ${progress ? "mt-1.5" : ""}`}>
                    同步已中断：{sync.error}。已同步的内容都已保存，点「继续同步」从断点继续。
                  </p>
                ) : null}
                {syncing ? (
                  <p className="mt-2 border-t border-[var(--hairline)] pt-2 text-[11px] text-[var(--ink-faint)]">
                    关闭本窗口不影响同步，网络波动会自动重试，完成后有提示；
                    关闭或刷新页面会中断，下次同步自动续传
                  </p>
                ) : null}
              </section>
            ) : null}

            <div className="flex justify-end gap-2">
              {syncing ? (
                <button
                  className="flex cursor-pointer items-center rounded-md border border-[var(--hairline-strong)] px-4 py-1.5 text-[13px] text-[var(--ink-soft)] hover:bg-[var(--paper)] disabled:opacity-60"
                  onClick={cancelFeishuSync}
                  disabled={sync.cancelling}
                >
                  {sync.cancelling ? "停止中…" : "停止"}
                </button>
              ) : null}
              <button className={btnPrimary} onClick={runSync} disabled={syncing}>
                {syncing ? <Loader2 size={13} className="animate-spin" /> : null}
                {syncing ? "同步中…" : sync.error && progress ? "继续同步" : "开始同步"}
              </button>
            </div>

            <Guide callbackUrl={callbackUrl} defaultOpen={false} />
          </div>
        )}
      </div>
    </div>
  );
}
