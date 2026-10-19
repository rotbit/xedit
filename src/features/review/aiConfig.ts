"use client";

/**
 * The "which types did I review last time" preference, stored in this browser's localStorage.
 *
 * No model or API key here: which provider, which model and what key are all set by the admin in the backend
 * (see lib/ai/siteSettings); the frontend doesn't pick, store or send them.
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
  /** Which types were checked last time (wording / WeChat rules, multi-select, at least one): the next 「审核」 (Review) click starts from here */
  kinds: ReviewKind[];
}

const FALLBACK: AiConfig = { kinds: [DEFAULT_REVIEW_KIND] };

/** The snapshot must be stable: useSyncExternalStore compares it every render, and parsing a fresh copy would cause infinite re-renders */
let cache: AiConfig = FALLBACK;
let loaded = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): AiConfig {
  if (!raw) return FALLBACK;
  try {
    const data = JSON.parse(raw) as { kinds?: unknown; kind?: unknown };
    // The stored value may have been written by an older version or tampered with, so always validate it.
    // The single-select era stored `kind`; accept it so people's selection isn't reset after upgrading
    const legacy = isReviewKind(data.kind) ? [data.kind] : [];
    return { kinds: cleanReviewKinds(Array.isArray(data.kinds) ? data.kinds : legacy) };
  } catch {
    // If it's corrupt, treat it as never stored: re-picking this setting is trivial, not worth an error
    return FALLBACK;
  }
}

/** Read the current settings. Only the first read touches localStorage; later reads hit the cache */
export function readAiConfig(): AiConfig {
  if (!loaded) {
    loaded = true;
    try {
      const raw = typeof window === "undefined" ? null : localStorage.getItem(STORE_KEY);
      cache = parse(raw);
      // Earlier versions stored the user's own key and model choice here; the backend owns those now,
      // so when old data is read, rewrite it in the new shape, and above all don't leave credentials in the browser
      if (raw && raw !== JSON.stringify(cache)) localStorage.setItem(STORE_KEY, JSON.stringify(cache));
    } catch {
      cache = FALLBACK; // localStorage throws outright in private mode
    }
  }
  return cache;
}

/** Update settings */
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

/** For unit tests: reset the module-level cache */
export function __resetAiConfigForTests(): void {
  cache = FALLBACK;
  loaded = false;
  listeners.clear();
}

/** Use this in components so they re-render after settings change */
export function useAiConfig(): [AiConfig, (patch: Partial<AiConfig>) => void] {
  const cfg = useSyncExternalStore(subscribe, readAiConfig, () => FALLBACK);
  const set = useCallback((patch: Partial<AiConfig>) => {
    writeAiConfig(patch);
  }, []);
  return [cfg, set];
}
