"use client";

/**
 * 「上次审的是哪几类」这点偏好，存在本机 localStorage 里。
 *
 * 这里没有模型也没有 API Key：用哪家的哪个模型、key 是什么，都由管理员在后台定
 * （见 lib/ai/siteSettings），前端不选、不存、不传。
 */
import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_REVIEW_KIND,
  cleanReviewKinds,
  isReviewKind,
  type ReviewKind,
} from "@/lib/ai/reviewKinds";

const STORE_KEY = "xedit.ai.config";

export interface AiConfig {
  /** 上次勾的是哪几类（表述 / 公众号规则，可多选，至少一类）：下次点「审核」仍停在这儿 */
  kinds: ReviewKind[];
}

const FALLBACK: AiConfig = { kinds: [DEFAULT_REVIEW_KIND] };

/** 快照要稳定：useSyncExternalStore 每次渲染都会比对，现 parse 一份会导致无限重渲 */
let cache: AiConfig = FALLBACK;
let loaded = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): AiConfig {
  if (!raw) return FALLBACK;
  try {
    const data = JSON.parse(raw) as { kinds?: unknown; kind?: unknown };
    // 存里那份可能是旧版本写的，也可能被人改花了，一律过一遍校验。
    // 单选时代存的是 kind，认一下，别让人升级后选择被重置
    const legacy = isReviewKind(data.kind) ? [data.kind] : [];
    return { kinds: cleanReviewKinds(Array.isArray(data.kinds) ? data.kinds : legacy) };
  } catch {
    // 存坏了就当没存过：这点设置重选一遍就好，不值得为它弹个错
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
      // 早先的版本在这里存过用户自己的 key 和模型选择；现在都归后台管，
      // 旧数据读到就按新形状重写一遍——尤其别让凭证继续留在浏览器里
      if (raw && raw !== JSON.stringify(cache)) localStorage.setItem(STORE_KEY, JSON.stringify(cache));
    } catch {
      cache = FALLBACK; // 隐私模式下 localStorage 会直接抛
    }
  }
  return cache;
}

/** 改设置 */
export function writeAiConfig(patch: Partial<AiConfig>): AiConfig {
  const base = readAiConfig();
  cache = { kinds: patch.kinds ? cleanReviewKinds(patch.kinds) : base.kinds };
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
