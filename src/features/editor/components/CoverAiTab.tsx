"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useStore } from "@/store/useStore";
import {
  COVER_STYLES,
  coverPrompt,
  coverServiceState,
  dataUrlToFile,
  generateCovers,
  type CoverServiceState,
  type CoverStyle,
} from "../lib/coverGenerate";
import { COVER_RATIO, coverTileCls } from "./coverStyles";

/**
 * 封面选择器的「AI 生成」页签：提示词 + 风格交给本机草稿服务生图，挑一张就走存图那条路。
 * 生图的 Key 在服务那边配（浏览器拿不到），所以这里先问一句服务在不在、配没配。
 */

const tip = "px-3 pb-3 pt-2 text-[12px] leading-relaxed text-[var(--ink-soft,var(--ink-faint))]";

export function CoverAiTab({
  body,
  /** 挑中的图交给调用方去存（有文库存文库，否则传云端）并设为封面；失败它自己弹提示 */
  onUse,
}: {
  body: string;
  onUse: (file: File) => Promise<void>;
}) {
  const [service, setService] = useState<CoverServiceState | "checking">("checking");
  // 提示词只在打开页签时预填一次：之后用户改过的不能被正文的每次击键冲掉
  const [prompt, setPrompt] = useState(() => coverPrompt(useStore.getState().title, body));
  const [style, setStyle] = useState<CoverStyle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [images, setImages] = useState<string[]>([]);
  /** 正在存第几张（-1 = 没在存）：转圈要盖在被点的那张上 */
  const [saving, setSaving] = useState(-1);
  // 生图要几十秒，面板一关（组件卸载）就掐掉，别让请求在后台空跑
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  useEffect(() => {
    const ctrl = new AbortController();
    void coverServiceState(ctrl.signal).then((s) => {
      if (!ctrl.signal.aborted) setService(s);
    });
    return () => ctrl.abort();
  }, []);

  const run = async () => {
    running.current?.abort();
    const ctrl = new AbortController();
    running.current = ctrl;
    setBusy(true);
    setError("");
    setImages([]);
    try {
      setImages(await generateCovers({ prompt: prompt.trim(), style }, ctrl.signal));
    } catch (e) {
      // 自己被 abort 掉（关面板、点了「再来一次」）不是错，不用报
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  };

  const pick = async (i: number) => {
    setSaving(i);
    try {
      await onUse(dataUrlToFile(images[i]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(-1);
    }
  };

  if (service === "checking")
    return (
      <p className={`${tip} flex items-center gap-1.5`}>
        <Loader2 size={13} className="animate-spin" />
        正在检查本机服务…
      </p>
    );
  if (service === "offline")
    return <p className={tip}>AI 生成需要 xEdit 桌面端（或本机草稿服务）在运行。</p>;
  if (service === "unconfigured")
    return (
      <p className={tip}>
        还没配置生图 Key：在 ~/.xedit-wechat-draft/config.json 里加上 replicateApiToken。
      </p>
    );

  return (
    <div className="flex flex-col gap-2 px-3 pb-2 pt-2">
      <textarea
        className="h-[66px] w-full resize-none rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-2 py-1.5 text-[12px] leading-5 text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--hairline-strong)]"
        placeholder="想要一张什么样的封面"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="flex items-center gap-1">
        {COVER_STYLES.map((s) => (
          <button
            key={s.id}
            // 风格是可选项：再点一下当前项就取消
            className={`h-6 flex-1 cursor-pointer rounded text-[12px] transition-colors ${
              style === s.id
                ? "bg-[var(--accent-wash)] text-[var(--accent)]"
                : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
            }`}
            onClick={() => setStyle(style === s.id ? null : s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {busy ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="animate-pulse rounded-md bg-[var(--accent-wash)]" style={COVER_RATIO} />
            <div className="animate-pulse rounded-md bg-[var(--accent-wash)]" style={COVER_RATIO} />
          </div>
          <p className="text-[12px] text-[var(--ink-faint)]">正在生成，大约需要十几秒…</p>
        </>
      ) : null}

      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {images.map((src, i) => (
            <button
              key={i}
              className={coverTileCls}
              style={COVER_RATIO}
              title="设为封面"
              disabled={saving >= 0}
              onClick={() => void pick(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
              {saving === i ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                  <Loader2 size={16} className="animate-spin text-white" />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="text-[12px] leading-5 text-[var(--danger,#d9534f)]">{error}</p>
      ) : null}

      <button
        className="flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] text-[12px] text-[var(--accent-fg)] transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
        disabled={busy || saving >= 0 || prompt.trim() === ""}
        onClick={() => void run()}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        {busy ? "正在生成…" : images.length > 0 ? "再来一次" : "生成"}
      </button>
    </div>
  );
}
