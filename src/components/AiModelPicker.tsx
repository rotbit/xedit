"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, ChevronDown, Check } from "lucide-react";
import { useStore, type ChatModelOption } from "@/store/useStore";

/**
 * 文本对话模型切换器。列出所有「已配密钥的平台 → 可选模型」，外加「跟随设置默认」。
 * 选择只存在本地浏览器（useStore.aiChatChoice），临时覆盖「AI 设置」里的默认，不改服务端配置。
 *
 * - variant="menu"：嵌在 AI 助手下拉里，内联展开（阻止冒泡以免关掉父级菜单）。
 * - variant="chip"：独立小胶囊（状态栏 / 结果弹窗顶部），弹层绝对定位。
 */
export function AiModelPicker({
  variant = "chip",
  placement = "down",
  onChange,
}: {
  variant?: "chip" | "menu";
  placement?: "up" | "down";
  onChange?: () => void;
}) {
  const models = useStore((s) => s.aiChatModels);
  const choice = useStore((s) => s.aiChatChoice);
  const defaultLabel = useStore((s) => s.aiChatDefaultLabel);
  const setChoice = useStore((s) => s.setAiChatChoice);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // 按平台分组，保持 catalog 里的平台顺序
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: ChatModelOption[] }>();
    for (const o of models) {
      const g = map.get(o.provider) ?? { label: o.providerLabel, items: [] };
      g.items.push(o);
      map.set(o.provider, g);
    }
    return [...map.values()];
  }, [models]);

  // 没有任何可用平台时不渲染（此时 AI 本身也用不了）
  if (models.length === 0) return null;

  const current = choice
    ? models.find((o) => o.provider === choice.provider && o.model === choice.model)
    : null;
  const currentLabel = current ? current.label : defaultLabel || "默认模型";

  const pick = (next: ChatModelOption | null) => {
    setChoice(next ? { provider: next.provider, model: next.model } : null);
    setOpen(false);
    onChange?.();
  };

  const list = (
    <div className="py-1">
      <button
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-[var(--ink)] hover:bg-[var(--paper)]"
        onClick={() => pick(null)}
      >
        <span className="flex-1">
          默认
          {defaultLabel ? <span className="text-[var(--ink-faint)]">（{defaultLabel}）</span> : null}
        </span>
        {choice === null ? <Check size={13} className="shrink-0 text-[var(--accent)]" /> : null}
      </button>
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-0.5 pt-1.5 text-[10.5px] tracking-widest text-[var(--ink-faint)]">
            {g.label}
          </p>
          {g.items.map((o) => {
            const on = current?.provider === o.provider && current?.model === o.model;
            return (
              <button
                key={`${o.provider}:${o.model}`}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-[var(--ink)] hover:bg-[var(--paper)]"
                onClick={() => pick(o)}
              >
                <span className="flex-1 truncate">{o.label}</span>
                {on ? <Check size={13} className="shrink-0 text-[var(--accent)]" /> : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  // 内联变体：嵌在父级下拉菜单里，阻止冒泡避免点选时关掉父菜单
  if (variant === "menu") {
    return (
      <div ref={ref} onClick={(e) => e.stopPropagation()}>
        <button
          className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
          onClick={() => setOpen((v) => !v)}
        >
          <Sparkles size={14} className="shrink-0 text-[var(--accent)]" />
          <span className="text-[var(--ink-soft)]">当前模型</span>
          <span className="ml-auto flex items-center gap-1 truncate font-medium">
            <span className="truncate">{currentLabel}</span>
            <ChevronDown size={13} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
        {open ? (
          <div className="mx-1.5 mb-1 max-h-64 overflow-y-auto rounded-md border border-[var(--hairline)] bg-[var(--panel)]">
            {list}
          </div>
        ) : null}
      </div>
    );
  }

  // 胶囊变体：独立控件，弹层绝对定位
  return (
    <div ref={ref} className="relative inline-flex">
      <button
        className="flex max-w-[200px] cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
        onClick={() => setOpen((v) => !v)}
        title="切换 AI 模型"
      >
        <Sparkles size={12} className="shrink-0 text-[var(--accent)]" />
        <span className="truncate">{currentLabel}</span>
        <ChevronDown size={11} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div
          className={`absolute right-0 z-[120] max-h-72 w-60 overflow-y-auto rounded-lg border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_8px_30px_rgba(0,0,0,0.14)] ${
            placement === "up" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
          }`}
        >
          {list}
        </div>
      ) : null}
    </div>
  );
}
