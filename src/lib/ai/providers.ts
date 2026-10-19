/**
 * AI provider catalog: which providers review (and future AI features) supports, their models, and where keys come from.
 *
 * This is pure data shared by server and web -- the settings panel lists dropdowns from it, the server builds request URLs from it.
 * So process.env must not appear here (it isn't available in the web bundle and would just be undefined):
 * keys are handled separately by siteSettings.ts (admin-entered + env fallback), which only loads on the server.
 *
 * There are only two transports (see chat.ts): OpenAI-compatible /chat/completions, and Replicate predictions.
 * The Chinese providers (DeepSeek / Kimi / Zhipu) all copy OpenAI's payload format, down to the field names.
 *
 * Model list checked against each provider's site in 2026-09. Nearly every flagship this generation forces "thinking" on, which brings three common traits:
 * - temperature is either ignored or errors out (Kimi K3, GPT-5 onward), so it's never sent;
 * - the output cap includes thinking tokens, so too small a cap leaves the body empty (see DEFAULT_MAX_TOKENS in chat.ts);
 * - thinking effort is set to low wherever adjustable: reviewing needs speed and stability, not olympiad math.
 */
import { tk } from "@/i18n/t";

/** Transport: decides which code path chat.ts takes */
export type AiTransport = "openai" | "replicate";

export interface AiProvider {
  id: AiProviderId;
  /** Name shown in the admin settings panel */
  label: string;
  transport: AiTransport;
  /** API base URL without a trailing slash; the openai transport appends /chat/completions */
  baseUrl: string;
  /**
   * Which key slot this provider uses, also the fallback env var name.
   * Claude and GPT on Replicate are two providers sharing one slot: one token works for both.
   */
  envKey: string;
  /** Common models for the dropdown; the first is the default */
  models: string[];
  /** Whether it supports response_format: json_object (if so, about half the parse failures go away) */
  jsonMode: boolean;
  /** Name of the output cap field: older APIs use max_tokens, newer ones (OpenAI / Kimi) only accept max_completion_tokens */
  tokensField: "max_tokens" | "max_completion_tokens";
  /** Provider-specific fixed inputs (mostly lowering thinking effort to low), merged into the request body as-is */
  extra?: Record<string, unknown>;
}

export type AiProviderId =
  | "deepseek"
  | "replicate"
  | "replicate-gpt"
  | "openai"
  | "kimi"
  | "glm";

/**
 * Models under two official accounts on Replicate. Replicate adds new ones anytime, so admin can enter a model name freely;
 * these are just the "click and go" ones, not a whitelist -- whether a model is allowed is up to Replicate.
 */
const CLAUDE_ON_REPLICATE = [
  "anthropic/claude-sonnet-5",
  "anthropic/claude-fable-5",
  "anthropic/claude-opus-4.7",
  "anthropic/claude-opus-4.6",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-4.5-sonnet",
  "anthropic/claude-4.5-haiku",
];
const GPT_ON_REPLICATE = [
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "openai/gpt-5.4",
  "openai/gpt-5.2",
  "openai/gpt-5-mini",
];

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: "deepseek",
    label: tk("DeepSeek（官网）"),
    transport: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    envKey: "DEEPSEEK_API_KEY",
    // The V4 generation was renamed: flash is the cheap fast tier, v4-pro is the flagship
    models: ["deepseek-flash", "deepseek-v4-pro"],
    jsonMode: true,
    tokensField: "max_tokens",
  },
  {
    id: "replicate",
    label: tk("Claude（Replicate）"),
    transport: "replicate",
    baseUrl: "https://api.replicate.com",
    envKey: "REPLICATE_API_TOKEN",
    models: CLAUDE_ON_REPLICATE,
    // Replicate proxies each provider's native API, so there's no response_format
    jsonMode: false,
    tokensField: "max_tokens",
  },
  {
    id: "replicate-gpt",
    label: tk("GPT（Replicate）"),
    transport: "replicate",
    baseUrl: "https://api.replicate.com",
    envKey: "REPLICATE_API_TOKEN",
    models: GPT_ON_REPLICATE,
    jsonMode: false,
    tokensField: "max_completion_tokens",
    extra: { reasoning_effort: "low" },
  },
  {
    id: "openai",
    label: tk("GPT（OpenAI 官网）"),
    transport: "openai",
    baseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    models: ["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna", "gpt-6-astra"],
    jsonMode: true,
    tokensField: "max_completion_tokens",
    extra: { reasoning_effort: "low" },
  },
  {
    id: "kimi",
    label: tk("Kimi（月之暗面官网）"),
    transport: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    envKey: "MOONSHOT_API_KEY",
    models: ["kimi-k3", "kimi-k2.6"],
    // K3's docs only mention json_schema, not json_object; rather than gamble, rely on the prompt and parser
    jsonMode: false,
    tokensField: "max_completion_tokens",
    extra: { reasoning_effort: "low" },
  },
  {
    id: "glm",
    label: tk("GLM（智谱官网）"),
    transport: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    envKey: "ZHIPU_API_KEY",
    models: ["glm-5.3", "glm-5.3-flash", "glm-5.2", "glm-4.7", "glm-4.7-flash"],
    jsonMode: true,
    tokensField: "max_tokens",
    extra: { reasoning_effort: "low" },
  },
];

const BY_ID = new Map(AI_PROVIDERS.map((p) => [p.id, p]));

/** Whether this provider id is recognized */
export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && BY_ID.has(value as AiProviderId);
}

/** Gets a provider; unknown ids return null, and the caller decides whether to error or fall back */
export function aiProvider(id: unknown): AiProvider | null {
  return isAiProviderId(id) ? (BY_ID.get(id) ?? null) : null;
}

/** Default provider: unless admin changes it, site-wide AI review uses this one (the user asked for DeepSeek) */
export const DEFAULT_AI_PROVIDER: AiProviderId = "deepseek";

/**
 * How model names are sanitized. Custom models come from a free-form input, and the name ends up in a URL (Replicate)
 * or is sent upstream as-is, so only the character classes real model names use are allowed.
 */
export function cleanModel(value: unknown, provider: AiProvider): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const safe = raw.replace(/[^A-Za-z0-9._:\-/]/g, "").slice(0, 120);
  return safe || provider.models[0];
}
