"use client";

/**
 * 「审哪一类、用哪家的哪个模型」这点偏好，存在本机 localStorage 里。
 *
 * 这里没有 API Key：各家的 key 全部配在服务端环境变量里（见 lib/ai/serverKeys），
 * 前端只管选模型，凭证不进浏览器、不进请求体。
 */
import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_AI_PROVIDER,
  aiProvider,
  cleanModel,
  isAiProviderId,
  type AiProviderId,
} from "@/lib/ai/providers";
import { DEFAULT_REVIEW_KIND, isReviewKind, type ReviewKind } from "@/lib/ai/reviewKinds";

const STORE_KEY = "xedit.ai.config";

export interface AiConfig {
  provider: AiProviderId;
  /** 当前供应商用哪个模型（可以是下拉里没有的自定义名） */
  model: string;
  /** 上次审的是哪一类（表述 / 公众号规则）：下次点「审核」仍停在这儿 */
  kind: ReviewKind;
}

const FALLBACK: AiConfig = {
  provider: DEFAULT_AI_PROVIDER,
  model: aiProvider(DEFAULT_AI_PROVIDER)?.models[0] ?? "",
  kind: DEFAULT_REVIEW_KIND,
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
    return {
      provider,
      model: cleanModel(data.model, aiProvider(provider)!),
      // 存里那份可能是旧版本写的（没有 kind），也可能被人改花了，一律过一遍校验
      kind: isReviewKind(data.kind) ? data.kind : FALLBACK.kind,
    };
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
      const raw = typeof window === "undefined" ? null : localStorage.getItem(STORE_KEY);
      cache = parse(raw);
      // 早先的版本允许用户在这里存自己的 key；现在 key 只在服务端，
      // 旧数据里要是还躺着一份，读到就顺手擦掉，别让凭证继续留在浏览器里
      if (raw && raw.includes('"keys"')) localStorage.setItem(STORE_KEY, JSON.stringify(cache));
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
    kind: isReviewKind(patch.kind) ? patch.kind : base.kind,
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
