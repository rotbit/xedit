"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import { toast } from "./Toast";
import { refreshAiStatus, aiImageReady } from "@/lib/ai";
import { openAuth } from "./AuthDialog";
import {
  PROVIDERS,
  CHAT_PROVIDERS,
  IMAGE_PROVIDERS,
  getProvider,
  type ProviderId,
} from "@/lib/ai/catalog";

const fieldCls =
  "h-9 w-full rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]";
const labelCls = "mb-1 mt-3 block text-[12px] text-[var(--ink-soft)]";

interface Draft {
  apiKey: string;
  keyEdited: boolean;
  hasKey: boolean;
  keyLast4: string;
  baseUrl: string;
  chatModel: string;
  imageModel: string;
  dirty: boolean;
}

export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [activeChat, setActiveChat] = useState("");
  const [activeImage, setActiveImage] = useState("");
  const [tab, setTab] = useState<ProviderId>("replicate");
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
        for (const meta of PROVIDERS) {
          const p = data?.providers?.[meta.id];
          next[meta.id] = {
            apiKey: "",
            keyEdited: false,
            hasKey: Boolean(p?.hasKey),
            keyLast4: p?.keyLast4 ?? "",
            baseUrl: p?.baseUrl ?? "",
            chatModel: p?.chatModel || meta.defaultChatModel,
            imageModel: p?.imageModel || meta.defaultImageModel,
            dirty: false,
          };
        }
        setDrafts(next);
        setActiveChat(data?.activeChat ?? "");
        setActiveImage(data?.activeImage ?? "");
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

  const patch = (id: string, p: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...p, dirty: true } }));

  const save = async () => {
    setSaving(true);
    try {
      for (const meta of PROVIDERS) {
        const d = drafts[meta.id];
        if (!d?.dirty) continue;
        const body: Record<string, string> = {
          provider: meta.id,
          baseUrl: d.baseUrl,
          chatModel: d.chatModel,
          imageModel: d.imageModel,
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
      const res = await fetch("/api/ai/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeChat, activeImage }),
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

  const meta = getProvider(tab)!;
  const d = drafts[tab];

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
            <div className="flex gap-1 border-b border-[var(--hairline)] px-3 pt-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className={`cursor-pointer rounded-t-md px-3 py-1.5 text-[12.5px] transition-colors ${
                    tab === p.id
                      ? "bg-[var(--accent-wash)] font-medium text-[var(--accent-deep)]"
                      : "text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                  }`}
                  onClick={() => setTab(p.id)}
                >
                  {p.id === "replicate"
                    ? "Replicate"
                    : p.id === "moonshot"
                      ? "Kimi"
                      : p.id === "zhipu"
                        ? "GLM"
                        : "DeepSeek"}
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
                onChange={(e) => patch(tab, { apiKey: e.target.value, keyEdited: true })}
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
                    onChange={(e) => patch(tab, { baseUrl: e.target.value })}
                    placeholder={meta.defaultBaseUrl}
                  />
                </>
              ) : null}

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>文本模型</label>
                  <input
                    className={fieldCls}
                    list={`chat-${meta.id}`}
                    value={d?.chatModel ?? ""}
                    onChange={(e) => patch(tab, { chatModel: e.target.value })}
                    placeholder={meta.defaultChatModel}
                  />
                  <datalist id={`chat-${meta.id}`}>
                    {meta.chatModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </datalist>
                </div>
                {meta.imageModels.length > 0 ? (
                  <div className="flex-1">
                    <label className={labelCls}>图片模型</label>
                    <input
                      className={fieldCls}
                      list={`img-${meta.id}`}
                      value={d?.imageModel ?? ""}
                      onChange={(e) => patch(tab, { imageModel: e.target.value })}
                      placeholder={meta.defaultImageModel}
                    />
                    <datalist id={`img-${meta.id}`}>
                      {meta.imageModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </datalist>
                  </div>
                ) : null}
              </div>

              {/* 启用哪个平台 */}
              <div className="mt-5 rounded-lg border border-[var(--hairline)] bg-[var(--paper)] p-3">
                <div className="flex items-center gap-3">
                  <label className="w-20 shrink-0 text-[12px] text-[var(--ink-soft)]">
                    文本对话用
                  </label>
                  <select
                    className={fieldCls}
                    value={activeChat}
                    onChange={(e) => setActiveChat(e.target.value)}
                  >
                    <option value="">未启用</option>
                    {CHAT_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <label className="w-20 shrink-0 text-[12px] text-[var(--ink-soft)]">
                    AI 生图用
                  </label>
                  <select
                    className={fieldCls}
                    value={activeImage}
                    onChange={(e) => setActiveImage(e.target.value)}
                  >
                    <option value="">未启用</option>
                    {IMAGE_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
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
