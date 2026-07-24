"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import { toast } from "./Toast";
import { refreshAiStatus, aiImageReady } from "@/lib/ai";
import { openAuth } from "./AuthDialog";
import {
  PROVIDER_SCOPES,
  providersOf,
  getProvider,
  type ProviderScope,
} from "@/lib/ai/catalog";

const fieldCls =
  "h-9 w-full rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]";
const labelCls = "mb-1 mt-3 block text-[12px] text-[var(--ink-soft)]";

const SCOPE_LABEL: Record<ProviderScope, string> = { chat: "文本对话", image: "AI 生图" };

interface Draft {
  apiKey: string;
  keyEdited: boolean;
  hasKey: boolean;
  keyLast4: string;
  baseUrl: string;
  model: string;
  dirty: boolean;
}

/** 草稿按「用途 + 平台」存，两个用途互不干扰 */
const draftKey = (scope: ProviderScope, provider: string) => `${scope}:${provider}`;

export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [active, setActive] = useState<Record<ProviderScope, string>>({ chat: "", image: "" });
  const [scope, setScope] = useState<ProviderScope>("chat");
  const [tabs, setTabs] = useState<Record<ProviderScope, string>>({
    chat: "replicate",
    image: "replicate",
  });
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
        for (const s of PROVIDER_SCOPES) {
          for (const meta of providersOf(s)) {
            const p = data?.[s]?.providers?.[meta.id];
            next[draftKey(s, meta.id)] = {
              apiKey: "",
              keyEdited: false,
              hasKey: Boolean(p?.hasKey),
              keyLast4: p?.keyLast4 ?? "",
              baseUrl: p?.baseUrl ?? "",
              model: p?.model || meta.defaultModel,
              dirty: false,
            };
          }
        }
        setDrafts(next);
        setActive({ chat: data?.chat?.active ?? "", image: data?.image?.active ?? "" });
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
      for (const s of PROVIDER_SCOPES) {
        for (const meta of providersOf(s)) {
          const d = drafts[draftKey(s, meta.id)];
          if (!d?.dirty) continue;
          const body: Record<string, string> = {
            scope: s,
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
      }
      const res = await fetch("/api/ai/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeChat: active.chat, activeImage: active.image }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "保存失败");
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

  const tab = tabs[scope];
  const meta = getProvider(scope, tab) ?? providersOf(scope)[0];
  const key = draftKey(scope, meta.id);
  const d = drafts[key];

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
            {/* 用途切换：文本对话 / AI 生图，两份配置完全独立 */}
            <div className="flex shrink-0 gap-1 px-4 pt-3">
              {PROVIDER_SCOPES.map((s) => (
                <button
                  key={s}
                  className={`cursor-pointer rounded-md px-3 py-1 text-[12.5px] transition-colors ${
                    scope === s
                      ? "bg-[var(--accent)] font-medium text-[var(--accent-fg)]"
                      : "text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                  }`}
                  onClick={() => setScope(s)}
                >
                  {SCOPE_LABEL[s]}
                </button>
              ))}
            </div>

            {/* 平台切换 */}
            <div className="flex shrink-0 gap-1 border-b border-[var(--hairline)] px-3 pt-2">
              {providersOf(scope).map((p) => (
                <button
                  key={p.id}
                  className={`cursor-pointer rounded-t-md px-3 py-1.5 text-[12.5px] transition-colors ${
                    tab === p.id
                      ? "bg-[var(--accent-wash)] font-medium text-[var(--accent-deep)]"
                      : "text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                  }`}
                  onClick={() => setTabs((t) => ({ ...t, [scope]: p.id }))}
                >
                  {p.tab}
                  {drafts[draftKey(scope, p.id)]?.hasKey ? (
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
                onChange={(e) => patch(key, { apiKey: e.target.value, keyEdited: true })}
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
                    onChange={(e) => patch(key, { baseUrl: e.target.value })}
                    placeholder={meta.defaultBaseUrl}
                  />
                </>
              ) : null}

              <label className={labelCls}>{scope === "chat" ? "文本模型" : "图片模型"}</label>
              <input
                className={fieldCls}
                list={`model-${scope}-${meta.id}`}
                value={d?.model ?? ""}
                onChange={(e) => patch(key, { model: e.target.value })}
                placeholder={meta.defaultModel}
              />
              <datalist id={`model-${scope}-${meta.id}`}>
                {meta.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </datalist>

              {/* 文本对话填了密钥即可用、在编辑器里随时切模型，无需在此启用；
                  生图没有编辑器切换器，仍需显式启用某个平台 */}
              {scope === "chat" ? (
                <p className="mt-5 rounded-lg border border-[var(--hairline)] bg-[var(--paper)] p-3 text-[12px] leading-5 text-[var(--ink-soft)]">
                  填好密钥即可使用，无需在此启用。写作时可在编辑器工具栏「AI 助手」或底部状态栏随时切换模型。
                </p>
              ) : (
                <div className="mt-5 flex items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--paper)] p-3">
                  <label className="w-20 shrink-0 text-[12px] text-[var(--ink-soft)]">
                    {SCOPE_LABEL[scope]}用
                  </label>
                  <select
                    className={fieldCls}
                    value={active[scope]}
                    onChange={(e) => setActive((a) => ({ ...a, [scope]: e.target.value }))}
                  >
                    <option value="">未启用</option>
                    {providersOf(scope).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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

const IMAGE_SIZES = [
  { label: "方形 1:1", value: "1024x1024" },
  { label: "横版封面 3:2", value: "1536x1024" },
  { label: "竖版 2:3", value: "1024x1536" },
];

export function AiImageDialog({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (markdown: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState(IMAGE_SIZES[0].value);
  const [busy, setBusy] = useState(false);
  // 生成中禁止 Esc 误关
  useEscape(onClose, !busy);

  const generate = async () => {
    if (!aiImageReady()) {
      toast("请先在「AI 设置」中启用生图平台并填写密钥", "error");
      return;
    }
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), size }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onInsert(`\n![${prompt.trim().slice(0, 40)}](${data.url})\n`);
      toast("图片已插入", "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "生成失败", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-[460px] max-w-[92vw] overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between border-b border-[var(--hairline)] px-4">
          <span className="flex items-center gap-2 text-[14px] font-medium [font-family:var(--serif)]">
            <Sparkles size={15} className="text-[var(--accent)]" />
            AI 生成配图
          </span>
          <button
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">
          <textarea
            className="h-24 w-full resize-none rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] p-3 text-[13px] outline-none focus:border-[var(--accent)]"
            placeholder="描述你想要的配图，例如：扁平插画风格，一台笔记本电脑上生长出绿色植物，柔和的米色背景"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="flex h-14 items-center justify-between gap-2 border-t border-[var(--hairline)] px-4">
          <div className="flex gap-1">
            {IMAGE_SIZES.map((s2) => (
              <button
                key={s2.value}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                  size === s2.value
                    ? "bg-[var(--accent-wash)] font-medium text-[var(--accent-deep)]"
                    : "text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                }`}
                onClick={() => setSize(s2.value)}
                disabled={busy}
              >
                {s2.label}
              </button>
            ))}
          </div>
          <button
            className="flex cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-deep)] disabled:opacity-60"
            onClick={() => void generate()}
            disabled={busy || !prompt.trim()}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}
            {busy ? "生成中…" : "生成并插入"}
          </button>
        </div>
      </div>
    </div>
  );
}
