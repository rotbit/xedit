"use client";

/**
 * 飞书导入弹窗的外壳，只负责按连接状态切界面。请求与状态都在 useFeishuConnection 里，
 * 同步进度在 FeishuSyncPanel，创建应用的图文步骤在 FeishuGuide。
 * 这里刻意不留业务逻辑，改流程先去看那个 hook。
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

// 两个输入框共用一份类名：凭证表单要看着是一组，别只改其中一处
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
  const t = useT();
  const locale = useLocale();

  return (
    <Modal
      title={t("飞书知识库导入")}
      icon={<BookDown size={16} className="text-[var(--accent)]" />}
      width={520}
      onClose={onClose}
    >
      {/* 四种界面按状态依次排除：加载中 → 未登录 → 凭证未存好/未授权 → 已连接可同步 */}
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
          {/* 第一步：账号自己的飞书应用凭证 */}
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
              // secret 在服务端加密存放，取不回明文，所以只回显后四位；留空表示这一项不改
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

          {/* 第二步：授权连接 */}
          <section className="flex flex-col items-center gap-2.5 rounded-md border border-dashed border-[var(--hairline-strong)] px-4 py-6 text-center">
            <p className="text-[12px] leading-5 text-[var(--ink-soft)]">
              {t("② 连接后即可把你有权限的知识库整库导入为文章")}
            </p>
            {/* 凭证有未保存的改动时禁掉连接：授权要跳出站外，飞书那边用的是服务端已存的凭证，会拿旧值去换 token */}
            <button className={btnPrimary} onClick={connect} disabled={!conn?.hasApp || appDirty}>
              {t("连接飞书")}
            </button>
            {!conn?.hasApp ? (
              <p className="text-[11px] text-[var(--ink-faint)]">{t("先保存上方应用凭证")}</p>
            ) : appDirty ? (
              <p className="text-[11px] text-[var(--ink-faint)]">{t("凭证有未保存的修改")}</p>
            ) : null}
          </section>

          {/* 还没存过凭证的人第一次进来直接展开教程，存过的默认收起 */}
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
              {/* 上次中断过（有错且留着进度）就改叫「继续同步」：同步是幂等的，接着跑不会重复导入 */}
              {syncing ? t("同步中…") : sync.error && progress ? t("继续同步") : t("开始同步")}
            </button>
          </div>

          <Guide callbackUrl={callbackUrl} defaultOpen={false} />
        </div>
      )}
    </Modal>
  );
}
