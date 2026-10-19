"use client";

/**
 * Shell of the Feishu import dialog; it only switches screens by connection state. Requests and state live in useFeishuConnection,
 * sync progress in FeishuSyncPanel, and the illustrated app-creation steps in FeishuGuide.
 * Business logic is deliberately kept out of here; to change the flow, look at that hook first.
 */
import { BookDown, Loader2, Unlink } from "lucide-react";
import { cancelFeishuSync } from "@/hooks/useFeishuSync";
import { openAuth } from "./AuthDialog";
import { Modal, btnPrimary, btnSecondary } from "./Modal";
import { Guide } from "./feishu/FeishuGuide";
import { FeishuSyncPanel } from "./feishu/FeishuSyncPanel";
import { useFeishuConnection } from "./feishu/useFeishuConnection";
import { htmlLang } from "@/i18n/locale";
import { useLocale, useT } from "@/i18n/useT";
import { rich } from "@/i18n/rich";

// Both inputs share one class string: the credentials form should look like a group, so don't change just one
const fieldCls =
  "h-9 w-full rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]";
const labelCls = "mb-1 mt-3 block text-[12px] text-[var(--ink-soft)]";

/**
 * Feishu wiki import: each account configures its own Feishu app credentials, connects (user-identity OAuth), then
 * picks a wiki space to sync incrementally in batches into xedit articles. Sync is idempotent — documents unchanged on the Feishu side are skipped entirely.
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
  const t = useT();
  const locale = useLocale();

  return (
    <Modal
      title={t("飞书知识库导入")}
      icon={<BookDown size={16} className="text-[var(--accent)]" />}
      width={520}
      onClose={onClose}
    >
      {/* The four screens are ruled out in order by state: loading → signed out → credentials not saved/not authorized → connected and ready to sync */}
      {loading ? (
        <div className="flex h-56 items-center justify-center text-[var(--ink-faint)]">
          <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
        </div>
      ) : needLogin ? (
        <div className="flex flex-col items-center gap-4 px-8 py-14 text-center">
          <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
            {t("导入的文章与应用凭证都保存在你的账号下，")}
            <br />
            {t("请先登录后再连接飞书。")}
          </p>
          <button
            className={btnPrimary}
            onClick={() => {
              onClose();
              openAuth("login");
            }}
          >
            {t("去登录")}
          </button>
        </div>
      ) : !conn || !connected ? (
        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
          {/* Step one: the account's own Feishu app credentials */}
          <section>
            <p className="text-[12px] text-[var(--ink-soft)]">
              {rich(t("① 应用凭证（每个账号配置自己的，{hint}）"), {
                hint: <span className="text-[var(--ink-faint)]">{t("创建方法见下方使用说明")}</span>,
              })}
            </p>
            <label className={labelCls}>App ID</label>
            <input
              className={fieldCls}
              value={appId}
              onChange={(e) => {
                setAppId(e.target.value);
                markAppDirty();
              }}
              placeholder={t("cli_ 开头的应用 ID")}
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
              // The secret is stored encrypted server-side and can't be read back in plaintext, so only the last four characters are echoed; leaving it blank means unchanged
              placeholder={
                conn?.secretLast4
                  ? t("已保存 ····{last4}（留空则不修改）", { last4: conn.secretLast4 })
                  : t("应用的 App Secret")
              }
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] text-[var(--ink-faint)]">{t("凭证加密保存在服务端，仅你的账号可用")}</p>
              <button
                className={btnPrimary}
                onClick={() => void saveApp()}
                disabled={savingApp || !appDirty}
              >
                {savingApp ? <Loader2 size={14} className="animate-spin" /> : null}
                {savingApp ? t("保存中…") : t("保存凭证")}
              </button>
            </div>
          </section>

          {/* Step two: authorize the connection */}
          <section className="flex flex-col items-center gap-2.5 rounded-md border border-dashed border-[var(--hairline-strong)] px-4 py-6 text-center">
            <p className="text-[12px] leading-5 text-[var(--ink-soft)]">
              {t("② 连接后即可把你有权限的知识库整库导入为文章")}
            </p>
            {/* Disable connecting while credentials have unsaved changes: authorization leaves the site and Feishu uses the server's stored credentials, so it would exchange the token with stale values */}
            <button className={btnPrimary} onClick={connect} disabled={!conn?.hasApp || appDirty}>
              {t("连接飞书")}
            </button>
            {!conn?.hasApp ? (
              <p className="text-[11px] text-[var(--ink-faint)]">{t("先保存上方应用凭证")}</p>
            ) : appDirty ? (
              <p className="text-[11px] text-[var(--ink-faint)]">{t("凭证有未保存的修改")}</p>
            ) : null}
          </section>

          {/* First-timers without saved credentials see the tutorial expanded; for those who've saved it's collapsed by default */}
          <Guide callbackUrl={callbackUrl} defaultOpen={!conn?.hasApp} />
        </div>
      ) : (
        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
          <section className="flex items-center gap-3 rounded-md border border-[var(--hairline-strong)] px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-[var(--ink)]">
                {conn.feishuName ? t("已连接飞书：{name}", { name: conn.feishuName }) : t("已连接飞书")}
              </p>
              {conn.lastSyncAt ? (
                <p className="text-[11px] text-[var(--ink-faint)]">
                  {t("上次同步 {time}", { time: new Date(conn.lastSyncAt).toLocaleString(htmlLang(locale)) })}
                </p>
              ) : null}
            </div>
            <button
              className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-red-600 disabled:opacity-50"
              onClick={() => void disconnect()}
              disabled={disconnecting || syncing}
            >
              {disconnecting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Unlink size={14} />
              )}
              {t("断开")}
            </button>
          </section>

          <section>
            <p className="mb-1.5 text-[12px] text-[var(--ink-soft)]">{t("选择知识库")}</p>
            {spaces === null ? (
              <div className="flex h-9 items-center gap-2 text-[12px] text-[var(--ink-faint)]">
                <Loader2 size={14} className="animate-spin" /> {t("加载知识空间…")}
              </div>
            ) : spaces.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--hairline-strong)] px-3 py-4 text-center text-[12px] text-[var(--ink-faint)]">
                {t("没有可访问的知识库")}
              </p>
            ) : (
              <select
                className="h-9 w-full cursor-pointer rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] px-2.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
                disabled={syncing}
              >
                <option value="">{t("请选择…")}</option>
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
                className={btnSecondary}
                onClick={cancelFeishuSync}
                disabled={sync.cancelling}
              >
                {sync.cancelling ? t("停止中…") : t("停止")}
              </button>
            ) : null}
            <button className={btnPrimary} onClick={runSync} disabled={syncing}>
              {syncing ? <Loader2 size={14} className="animate-spin" /> : null}
              {/* If last run was interrupted (an error with progress kept), relabel as 「继续同步」 (Resume sync): sync is idempotent, so resuming won't import duplicates */}
              {syncing ? t("同步中…") : sync.error && progress ? t("继续同步") : t("开始同步")}
            </button>
          </div>

          <Guide callbackUrl={callbackUrl} defaultOpen={false} />
        </div>
      )}
    </Modal>
  );
}
