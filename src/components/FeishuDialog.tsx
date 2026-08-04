"use client";

import { BookDown, Loader2, Unlink, X } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import { cancelFeishuSync } from "@/hooks/useFeishuSync";
import { openAuth } from "./AuthDialog";
import { Guide } from "./feishu/FeishuGuide";
import { FeishuSyncPanel } from "./feishu/FeishuSyncPanel";
import { useFeishuConnection } from "./feishu/useFeishuConnection";

const btnPrimary =
  "flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-deep)] disabled:opacity-60";
const fieldCls =
  "h-9 w-full rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]";
const labelCls = "mb-1 mt-3 block text-[12px] text-[var(--ink-soft)]";

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
  const {
    loading,
    needLogin,
    conn,
    appId,
    setAppId,
    appSecret,
    setAppSecret,
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
  } = useFeishuConnection(onSynced);
  useEscape(onClose);

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

            <FeishuSyncPanel sync={sync} />

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
