"use client";

import { useState } from "react";
import { X, Loader2, Sparkles } from "lucide-react";
import { useStore } from "@/store/useStore";
import { toast } from "./Toast";

const fieldCls =
  "h-9 w-full rounded-md border border-[var(--hairline-strong)] bg-white px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]";
const labelCls = "mb-1 mt-3 block text-[12px] text-[var(--ink-soft)]";

export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const store = useStore.getState();
  const setAiConfig = useStore((s) => s.setAiConfig);
  const [baseUrl, setBaseUrl] = useState(store.aiBaseUrl);
  const [apiKey, setApiKey] = useState(store.aiApiKey);
  const [model, setModel] = useState(store.aiModel);
  const [imageModel, setImageModel] = useState(store.aiImageModel);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-[460px] max-w-[92vw] overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between border-b border-[var(--hairline)] px-4">
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

        <div className="px-5 pb-2 pt-1">
          <label className={labelCls}>接口地址（OpenAI 兼容格式）</label>
          <input
            className={fieldCls}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
          <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
            DeepSeek：https://api.deepseek.com/v1 · 通义：https://dashscope.aliyuncs.com/compatible-mode/v1 · 本地 Ollama：http://localhost:11434/v1
          </p>

          <label className={labelCls}>API Key</label>
          <input
            className={fieldCls}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…（仅保存在你自己的浏览器里）"
          />

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>文本模型（翻译/润色）</label>
              <input
                className={fieldCls}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini / deepseek-chat"
              />
            </div>
            <div className="flex-1">
              <label className={labelCls}>图片模型（AI 生图）</label>
              <input
                className={fieldCls}
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value)}
                placeholder="gpt-image-1"
              />
            </div>
          </div>
        </div>

        <div className="flex h-14 items-center justify-between border-t border-[var(--hairline)] px-4">
          <p className="text-[11px] text-[var(--ink-faint)]">
            Key 只存在本地浏览器，调用经本站中转，不会上传数据库
          </p>
          <button
            className="cursor-pointer rounded-md bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--accent-deep)]"
            onClick={() => {
              setAiConfig({
                aiBaseUrl: baseUrl.trim(),
                aiApiKey: apiKey.trim(),
                aiModel: model.trim(),
                aiImageModel: imageModel.trim(),
              });
              toast("AI 设置已保存", "success");
              onClose();
            }}
          >
            保存
          </button>
        </div>
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

  const generate = async () => {
    const s = useStore.getState();
    if (!s.aiApiKey && !s.aiBaseUrl.includes("localhost")) {
      toast("请先在「AI 设置」中配置 API Key", "error");
      return;
    }
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: s.aiBaseUrl,
          apiKey: s.aiApiKey,
          model: s.aiImageModel,
          prompt: prompt.trim(),
          size,
        }),
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
            className="h-24 w-full resize-none rounded-md border border-[var(--hairline-strong)] bg-white p-3 text-[13px] outline-none focus:border-[var(--accent)]"
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
            className="flex cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-60"
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
