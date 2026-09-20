"use client";

/**
 * 「用哪家的哪个模型、key 是什么」这点设置，存在本机 localStorage 里。
 *
 * 为什么不进云端设置（/api/settings）：那张表是跟着账号走的，key 存进去等于
 * 替用户把凭证托管在本站库里；本站又是本地优先、不登录也能写文章的，
 * 存本机既够用又不牵扯托管责任。换台机器要重填一次，这个代价是值的。
 *
 * key 唯一的去处是本站的 /api/ai/review，由服务端转发给上游——
 * 浏览器直连各家会撞 CORS，服务端也只是借道，不记不存。
 */
import { useCallback, useSyncExternalStore } from "react";
import {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  aiProvider,
  cleanModel,
  isAiProviderId,
  type AiProviderId,
} from "@/lib/ai/providers";

const STORE_KEY = "xedit.ai.config";

export interface AiConfig {
  provider: AiProviderId;
  /** 当前供应商用哪个模型（可以是下拉里没有的自定义名） */
  model: string;
  /** 每家各存各的 key：换回上一家时不用重新粘一遍 */
  keys: Partial<Record<AiProviderId, string>>;
}

const FALLBACK: AiConfig = {
  provider: DEFAULT_AI_PROVIDER,
  model: aiProvider(DEFAULT_AI_PROVIDER)?.models[0] ?? "",
  keys: {},
};

/** 快照要稳定：useSyncExternalStore 每次渲染都会比对，现 parse 一份会导致无限重渲 */
let cache: AiConfig = FALLBACK;
let loaded = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): AiConfig {
  if (!raw) return FALLBACK;
  try {
    const data = JSON.parse(raw) as Partial<AiConfig>;
    const provider = isAiProviderId(data.provider) ? data.provider : FALLBACK.provider;
    const keys: Partial<Record<AiProviderId, string>> = {};
    for (const p of AI_PROVIDERS) {
      const one = (data.keys as Record<string, unknown> | undefined)?.[p.id];
      if (typeof one === "string" && one.trim()) keys[p.id] = one.trim();
    }
    return { provider, model: cleanModel(data.model, aiProvider(provider)!), keys };
  } catch {
    // 存坏了就当没存过：这点设置重填一遍就好，不值得为它弹个错
    return FALLBACK;
  }
}

/** 读当前设置。第一次读才碰 localStorage，之后都走缓存 */
export function readAiConfig(): AiConfig {
  if (!loaded) {
    loaded = true;
    try {
      cache = parse(typeof window === "undefined" ? null : localStorage.getItem(STORE_KEY));
    } catch {
      cache = FALLBACK; // 隐私模式下 localStorage 会直接抛
    }
  }
  return cache;
}

/** 改设置：只带要改的字段，其余保持原样 */
export function writeAiConfig(patch: Partial<AiConfig>): AiConfig {
  const base = readAiConfig();
  const provider = patch.provider ?? base.provider;
  const spec = aiProvider(provider)!;
  // 换供应商时模型要跟着换：上一家的模型名在这一家多半不存在
  const model =
    patch.model !== undefined
      ? cleanModel(patch.model, spec)
      : provider === base.provider
        ? base.model
        : spec.models[0];
  cache = {
    provider,
    model,
    keys: { ...base.keys, ...patch.keys },
  };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cache));
  } catch {}
  for (const fn of listeners) fn();
  return cache;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 当前这家的 key（用户自己填的那份） */
export function aiKeyOf(cfg: AiConfig): string {
  return cfg.keys[cfg.provider]?.trim() ?? "";
}

/** 单测用：把模块级缓存复位 */
export function __resetAiConfigForTests(): void {
  cache = FALLBACK;
  loaded = false;
  listeners.clear();
}

/** 组件里用这个，改完设置能自己重渲 */
export function useAiConfig(): [AiConfig, (patch: Partial<AiConfig>) => void] {
  const cfg = useSyncExternalStore(subscribe, readAiConfig, () => FALLBACK);
  const set = useCallback((patch: Partial<AiConfig>) => {
    writeAiConfig(patch);
  }, []);
  return [cfg, set];
}
