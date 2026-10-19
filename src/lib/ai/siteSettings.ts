/**
 * Site-wide AI settings (server only): which model AI review uses, upstream tokens per provider, and prompts per review kind.
 *
 * All written to the SiteSetting table by the admin panel. Tokens are encrypted with lib/ai/crypto before storage;
 * plaintext only appears briefly inside this module and never in any API response -- admin display only shows "source + last four".
 * Env vars still work as a fallback: slots not filled in admin read from env, so old deployments need no migration.
 *
 * Read very often (/api/config asks on every page open), so the whole table is cached in memory;
 * this site runs as a single container, so invalidating the cache on write is enough; the TTL is just extra insurance.
 */
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, keyLast4 } from "./crypto";
import {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  aiProvider,
  cleanModel,
  type AiProvider,
  type AiProviderId,
} from "./providers";
import { MAX_GUIDE_CHARS, defaultReviewGuide } from "./reviewPrompt";
import { REVIEW_KINDS, isReviewKind, type ReviewKind } from "./reviewKinds";
import { tk } from "@/i18n/t";

const REVIEW_KEY = "ai.review";
const KEY_PREFIX = "ai.key.";
const PROMPT_PREFIX = "ai.prompt.";
const TTL_MS = 60_000;
/** No token is ever this long; going over usually means something wrong was pasted */
const MAX_TOKEN_CHARS = 400;

let cache: { at: number; rows: Map<string, string> } | null = null;

async function rows(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const list = await prisma.siteSetting.findMany();
  cache = { at: Date.now(), rows: new Map(list.map((r) => [r.key, r.value])) };
  return cache.rows;
}

async function put(key: string, value: string | null): Promise<void> {
  if (value === null) await prisma.siteSetting.deleteMany({ where: { key } });
  else {
    await prisma.siteSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  cache = null;
}

/** All key slots (deduped envKey): Replicate's two providers share one */
export const AI_KEY_SLOTS: string[] = [...new Set(AI_PROVIDERS.map((p) => p.envKey))];

export interface ReviewModel {
  provider: AiProviderId;
  model: string;
}

/** Sanitizing the stored JSON: unknown providers revert to the default, model names go through cleanModel */
export function parseReviewModel(raw: string | undefined): ReviewModel {
  let data: { provider?: unknown; model?: unknown } = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") data = parsed;
  } catch {}
  const known = aiProvider(data.provider);
  const spec = known ?? aiProvider(DEFAULT_AI_PROVIDER)!;
  // Drop the model name too when the provider is unknown: it's another provider's name and would just 404 on the default one
  return { provider: spec.id, model: cleanModel(known ? data.model : undefined, spec) };
}

/** Which model site-wide AI review currently uses; DeepSeek's default model if admin never set one */
export async function getReviewModel(): Promise<ReviewModel> {
  return parseReviewModel((await rows()).get(REVIEW_KEY));
}

export async function setReviewModel(provider: AiProvider, model: unknown): Promise<ReviewModel> {
  const next = { provider: provider.id, model: cleanModel(model, provider) };
  await put(REVIEW_KEY, JSON.stringify(next));
  return next;
}

/** Usable token for this provider right now: admin-entered first, otherwise env, else an empty string */
export async function siteAiKey(provider: AiProvider): Promise<string> {
  const stored = decryptSecret((await rows()).get(KEY_PREFIX + provider.envKey) ?? "");
  return stored || (process.env[provider.envKey]?.trim() ?? "");
}

/** Errors that can be shown to admins directly (bad input); for others (DB down, etc.) don't leak details */
export class AiSettingError extends Error {}

/** Writes the token for a slot; an empty string = clear the admin-entered one (env values are unaffected) */
export async function setAiKey(slot: string, plain: string): Promise<void> {
  if (!AI_KEY_SLOTS.includes(slot)) throw new AiSettingError(tk("认不出这个 key 槽位"));
  const value = plain.trim();
  if (value.length > MAX_TOKEN_CHARS) throw new AiSettingError(tk("这串 token 太长了，检查一下是不是粘错了"));
  await put(KEY_PREFIX + slot, value ? encryptSecret(value) : null);
}

export interface AiKeyStatus {
  slot: string;
  /** Entered in admin / from env / none */
  source: "admin" | "env" | "none";
  /** Only show the last four, enough for admins to tell which one it is */
  last4: string;
}

/** For admin display: source and last four of each slot, never the full token */
export async function aiKeyStatuses(): Promise<AiKeyStatus[]> {
  const all = await rows();
  return AI_KEY_SLOTS.map((slot) => {
    const stored = decryptSecret(all.get(KEY_PREFIX + slot) ?? "");
    const env = process.env[slot]?.trim() ?? "";
    const source = stored ? "admin" : env ? "env" : "none";
    return { slot, source, last4: keyLast4(stored || env) };
  });
}

/** Whether AI review can run right now: does the selected provider have a token. /api/config uses this to tell the web whether to disable the button */
export async function aiReviewReady(): Promise<boolean> {
  const { provider } = await getReviewModel();
  return (await siteAiKey(aiProvider(provider)!)) !== "";
}

/** Current "review guide" for this kind: admin's version if changed, otherwise the default in code */
export async function getReviewGuide(kind: ReviewKind): Promise<string> {
  return (await rows()).get(PROMPT_PREFIX + kind)?.trim() || defaultReviewGuide(kind);
}

/**
 * Changes a kind's "review guide". An empty string, or one identical to the default = restore default (no row kept in the DB):
 * that way, when the default text improves later, sites that never customized it follow along instead of being pinned to an identical old copy.
 */
export async function setReviewGuide(kind: unknown, text: string): Promise<void> {
  if (!isReviewKind(kind)) throw new AiSettingError(tk("认不出这个审核类型"));
  const value = text.trim();
  if (value.length > MAX_GUIDE_CHARS) {
    throw new AiSettingError(`提示词太长了，最多 ${MAX_GUIDE_CHARS} 字`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  }
  const same = value === "" || value === defaultReviewGuide(kind).trim();
  await put(PROMPT_PREFIX + kind, same ? null : value);
}

export interface ReviewGuideStatus {
  kind: ReviewKind;
  label: string;
  /** The one currently in effect */
  text: string;
  /** Default text in code, used by 「恢复默认」 (Restore default) */
  defaultText: string;
  custom: boolean;
}

/** For admin display: each kind's current prompt and default text */
export async function reviewGuideStatuses(): Promise<ReviewGuideStatus[]> {
  const all = await rows();
  return REVIEW_KINDS.map((k) => {
    const stored = all.get(PROMPT_PREFIX + k.id)?.trim() ?? "";
    const defaultText = defaultReviewGuide(k.id);
    return { kind: k.id, label: k.label, text: stored || defaultText, defaultText, custom: stored !== "" };
  });
}
