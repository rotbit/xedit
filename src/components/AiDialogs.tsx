"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import { toast } from "./Toast";
import { refreshAiStatus } from "@/lib/ai";
import { openAuth } from "./AuthDialog";
import { CHAT_PROVIDERS, getProvider } from "@/lib/ai/catalog";

const fieldCls =
  "h-9 w-full rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]";
const labelCls = "mb-1 mt-3 block text-[12px] text-[var(--ink-soft)]";

interface Draft {
  apiKey: string;
  keyEdited: boolean;
  hasKey: boolean;
  keyLast4: string;
  baseUrl: string;
  model: string;
  dirty: boolean;
}

/** AI 设置：配置文本平台密钥，供「公众号内容审查」调用 */
export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [tab, setTab] = useState("replicate");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  useEscape(onClose, !saving);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/providers");
        if (res.status === 401) {
          if (!cancelled) {
            setNeedLogin(true);
            setLoading(false);
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const next: Record<string, Draft> = {};
        for (const meta of CHAT_PROVIDERS) {
          const p = data?.chat?.providers?.[meta.id];
          next[meta.id] = {
            apiKey: "",
            keyEdited: false,
            hasKey: Boolean(p?.hasKey),
            keyLast4: p?.keyLast4 ?? "",
            baseUrl: p?.baseUrl ?? "",
            model: p?.model || meta.defaultModel,
            dirty: false,
          };
        }
        setDrafts(next);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoading(false);
          toast("加载 AI 配置失败", "error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (key: string, p: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [key]: { ...d[key], ...p, dirty: true } }));

  const save = async () => {
    setSaving(true);
    try {
      for (const meta of CHAT_PROVIDERS) {
        const d = drafts[meta.id];
        if (!d?.dirty) continue;
        const body: Record<string, string> = {
          scope: "chat",
          provider: meta.id,
          baseUrl: d.baseUrl,
          model: d.model,
        };
        if (d.keyEdited) body.apiKey = d.apiKey;
        const res = await fetch("/api/ai/providers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error ?? "保存失败");
        }
      }
      await refreshAiStatus();
      toast("AI 设置已保存", "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const meta = getProvider("chat", tab) ?? CHAT_PROVIDERS[0];
  const d = drafts[meta.id];

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={() => !saving && onClose()}
    >
      <div
        className="flex max-h-[92vh] w-[520px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4">
          <span className="flex items-center gap-2 text-[14px] font-medium [font-family:var(--serif)]">
            <Sparkles size={15} className="text-[var(--accent)]" />
            AI 设置
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
              AI 密钥按账号加密保存在服务端，
              <br />
              请先登录后再配置与使用。
            </p>
            <button
              className="cursor-pointer rounded-md bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-deep)]"
              onClick={() => {
                onClose();
                openAuth("login");
              }}
            >
              去登录
            </button>
          </div>
        ) : (
          <>
            {/* 平台切换 */}
            <div className="flex shrink-0 gap-1 border-b border-[var(--hairline)] px-3 pt-3">
              {CHAT_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className={`cursor-pointer rounded-t-md px-3 py-1.5 text-[12.5px] transition-colors ${
                    tab === p.id
                      ? "bg-[var(--accent-wash)] font-medium text-[var(--accent-deep)]"
                      : "text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                  }`}
                  onClick={() => setTab(p.id)}
                >
                  {p.tab}
                  {drafts[p.id]?.hasKey ? (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />
                  ) : null}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 pt-1">
              <p className="mt-2 flex items-center gap-1 text-[11px] text-[var(--ink-faint)]">
                {meta.note ?? meta.label}
                <a
                  href={meta.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-[var(--accent)] hover:underline"
                >
                  获取 Key <ExternalLink size={11} />
                </a>
              </p>

              <label className={labelCls}>API Key</label>
              <input
                className={fieldCls}
                type="password"
                value={d?.apiKey ?? ""}
                onChange={(e) => patch(meta.id, { apiKey: e.target.value, keyEdited: true })}
                placeholder={
                  d?.hasKey ? `已保存 ····${d.keyLast4}（留空则不修改）` : meta.keyHint
                }
              />

              {meta.kind === "openai" ? (
                <>
                  <label className={labelCls}>接口地址（可选，留空用默认）</label>
                  <input
                    className={fieldCls}
                    value={d?.baseUrl ?? ""}
                    onChange={(e) => patch(meta.id, { baseUrl: e.target.value })}
                    placeholder={meta.defaultBaseUrl}
                  />
                </>
              ) : null}

              <label className={labelCls}>文本模型</label>
              <input
                className={fieldCls}
                list={`model-chat-${meta.id}`}
                value={d?.model ?? ""}
                onChange={(e) => patch(meta.id, { model: e.target.value })}
                placeholder={meta.defaultModel}
              />
              <datalist id={`model-chat-${meta.id}`}>
                {meta.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </datalist>

              <p className="mt-5 rounded-lg border border-[var(--hairline)] bg-[var(--paper)] p-3 text-[12px] leading-5 text-[var(--ink-soft)]">
                任一平台填好密钥即可使用「公众号内容审查」，无需额外启用。
              </p>
            </div>

            <div className="flex h-14 shrink-0 items-center justify-between border-t border-[var(--hairline)] px-4">
              <p className="text-[11px] text-[var(--ink-faint)]">
                密钥加密保存在服务端，调用经本站中转
              </p>
              <button
                className="flex cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-deep)] disabled:opacity-60"
                onClick={() => void save()}
                disabled={saving}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : null}
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
