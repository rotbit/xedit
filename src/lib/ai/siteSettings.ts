/**
 * 全站的 AI 设置（服务端专用）：AI 审核用哪个模型、各家上游的 token、各类审核的提示词。
 *
 * 都由管理后台写进 SiteSetting 表。token 入库前用 lib/ai/crypto 加密，
 * 明文只在这个模块里短暂出现，绝不出现在任何接口的返回里——后台回显只给「来源 + 末四位」。
 * 环境变量仍然有效，当兜底：后台没填的槽位就读 env，老部署不用迁移。
 *
 * 读得很勤（/api/config 每次开页都来问一遍），所以整表缓存在内存里；
 * 本站是单容器部署，写的时候顺手把缓存作废就够了，TTL 只是多一道保险。
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

const REVIEW_KEY = "ai.review";
const KEY_PREFIX = "ai.key.";
const PROMPT_PREFIX = "ai.prompt.";
const TTL_MS = 60_000;
/** token 再长也不至于过这个数；超了多半是粘错了东西 */
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

/** 所有 key 槽位（去重后的 envKey）：Replicate 的两个供应商共用一个 */
export const AI_KEY_SLOTS: string[] = [...new Set(AI_PROVIDERS.map((p) => p.envKey))];

export interface ReviewModel {
  provider: AiProviderId;
  model: string;
}

/** 库里那段 JSON 的洗法：认不出的供应商回到默认，模型名过一遍 cleanModel */
export function parseReviewModel(raw: string | undefined): ReviewModel {
  let data: { provider?: unknown; model?: unknown } = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") data = parsed;
  } catch {}
  const known = aiProvider(data.provider);
  const spec = known ?? aiProvider(DEFAULT_AI_PROVIDER)!;
  // 供应商认不出时连模型名一起丢：那是别家的名字，拿去问默认这家只会 404
  return { provider: spec.id, model: cleanModel(known ? data.model : undefined, spec) };
}

/** 全站 AI 审核现在用哪个模型；后台没设过就是 DeepSeek 的默认模型 */
export async function getReviewModel(): Promise<ReviewModel> {
  return parseReviewModel((await rows()).get(REVIEW_KEY));
}

export async function setReviewModel(provider: AiProvider, model: unknown): Promise<ReviewModel> {
  const next = { provider: provider.id, model: cleanModel(model, provider) };
  await put(REVIEW_KEY, JSON.stringify(next));
  return next;
}

/** 这家现在能用的 token：后台填的优先，没填读环境变量，都没有返回空串 */
export async function siteAiKey(provider: AiProvider): Promise<string> {
  const stored = decryptSecret((await rows()).get(KEY_PREFIX + provider.envKey) ?? "");
  return stored || (process.env[provider.envKey]?.trim() ?? "");
}

/** 能直接给管理员看的那类错（填错了）；别的错（库挂了之类）不往外说细节 */
export class AiSettingError extends Error {}

/** 写一个槽位的 token；传空串 = 清掉后台填的那份（环境变量里的不受影响） */
export async function setAiKey(slot: string, plain: string): Promise<void> {
  if (!AI_KEY_SLOTS.includes(slot)) throw new AiSettingError("认不出这个 key 槽位");
  const value = plain.trim();
  if (value.length > MAX_TOKEN_CHARS) throw new AiSettingError("这串 token 太长了，检查一下是不是粘错了");
  await put(KEY_PREFIX + slot, value ? encryptSecret(value) : null);
}

export interface AiKeyStatus {
  slot: string;
  /** 后台填的 / 环境变量里的 / 都没有 */
  source: "admin" | "env" | "none";
  /** 只回显末四位，够管理员认出是哪一把就行 */
  last4: string;
}

/** 后台回显用：每个槽位的来源与末四位，绝不含完整 token */
export async function aiKeyStatuses(): Promise<AiKeyStatus[]> {
  const all = await rows();
  return AI_KEY_SLOTS.map((slot) => {
    const stored = decryptSecret(all.get(KEY_PREFIX + slot) ?? "");
    const env = process.env[slot]?.trim() ?? "";
    const source = stored ? "admin" : env ? "env" : "none";
    return { slot, source, last4: keyLast4(stored || env) };
  });
}

/** AI 审核此刻能不能跑：选定的那家有没有 token。/api/config 据此告诉网页按钮灰不灰 */
export async function aiReviewReady(): Promise<boolean> {
  const { provider } = await getReviewModel();
  return (await siteAiKey(aiProvider(provider)!)) !== "";
}

/** 这一类审核现在用的「审核要求」：后台改过用后台的，没改过用代码里的默认文案 */
export async function getReviewGuide(kind: ReviewKind): Promise<string> {
  return (await rows()).get(PROMPT_PREFIX + kind)?.trim() || defaultReviewGuide(kind);
}

/**
 * 改一类审核的「审核要求」。传空串、或者与默认文案一字不差 = 恢复默认（库里不留行）：
 * 这样以后默认文案改进了，没自己改过的站点自动跟上，不会被一份一模一样的旧拷贝钉住。
 */
export async function setReviewGuide(kind: unknown, text: string): Promise<void> {
  if (!isReviewKind(kind)) throw new AiSettingError("认不出这个审核类型");
  const value = text.trim();
  if (value.length > MAX_GUIDE_CHARS) {
    throw new AiSettingError(`提示词太长了，最多 ${MAX_GUIDE_CHARS} 字`);
  }
  const same = value === "" || value === defaultReviewGuide(kind).trim();
  await put(PROMPT_PREFIX + kind, same ? null : value);
}

export interface ReviewGuideStatus {
  kind: ReviewKind;
  label: string;
  /** 现在生效的那份 */
  text: string;
  /** 代码里的默认文案，「恢复默认」用 */
  defaultText: string;
  custom: boolean;
}

/** 后台回显用：每类审核现在的提示词与默认文案 */
export async function reviewGuideStatuses(): Promise<ReviewGuideStatus[]> {
  const all = await rows();
  return REVIEW_KINDS.map((k) => {
    const stored = all.get(PROMPT_PREFIX + k.id)?.trim() ?? "";
    const defaultText = defaultReviewGuide(k.id);
    return { kind: k.id, label: k.label, text: stored || defaultText, defaultText, custom: stored !== "" };
  });
}
