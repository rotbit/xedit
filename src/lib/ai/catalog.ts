/**
 * AI 平台目录：平台元信息与模型候选，前后端共用，不含任何密钥。
 *
 * 「文本对话」与「AI 生图」是两份互相独立的配置（scope）：各自选平台、各自填密钥与模型。
 * 同一个平台（如 Replicate）出现在两个 scope 里时，也是两条互不影响的记录。
 *
 * 两类接入：
 * - replicate：一个 token 覆盖 openai/claude/gemini/deepseek/kimi 等全部家族（原生 prediction 接口）
 * - openai 兼容：kimi(moonshot) / glm(zhipu) / deepseek 各自官方接口
 */

export type ProviderScope = "chat" | "image";
export type ProviderKind = "replicate" | "openai";

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderMeta {
  /** 平台 id，在同一个 scope 内唯一 */
  id: string;
  /** 展示名 */
  label: string;
  /** 标签页上的短名 */
  tab: string;
  kind: ProviderKind;
  /** openai 兼容平台的默认接口地址；replicate 固定不用改 */
  defaultBaseUrl: string;
  keyHint: string;
  /** 申领 Key 的页面 */
  keyUrl: string;
  note?: string;
  /** 该 scope 下的候选模型 */
  models: ModelOption[];
  defaultModel: string;
}

const REPLICATE_BASE = {
  id: "replicate",
  label: "Replicate（openai/claude/gemini…）",
  tab: "Replicate",
  kind: "replicate",
  defaultBaseUrl: "https://api.replicate.com/v1",
  keyHint: "r8_… （Replicate API token）",
  keyUrl: "https://replicate.com/account/api-tokens",
  note: "一个 token 即可调用下列全部模型；也可直接填任意 owner/name 形式的模型名。",
} as const;

/** 文本对话可选平台 */
export const CHAT_PROVIDERS: ProviderMeta[] = [
  {
    ...REPLICATE_BASE,
    models: [
      { id: "openai/gpt-5", label: "GPT-5（OpenAI）" },
      { id: "openai/gpt-5-mini", label: "GPT-5 mini（OpenAI）" },
      { id: "openai/gpt-4o", label: "GPT-4o（OpenAI）" },
      { id: "openai/o4-mini", label: "o4-mini（OpenAI）" },
      { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6（Anthropic）" },
      { id: "anthropic/claude-4.5-sonnet", label: "Claude 4.5 Sonnet（Anthropic）" },
      { id: "anthropic/claude-4.5-haiku", label: "Claude 4.5 Haiku（Anthropic）" },
      { id: "google/gemini-3-pro", label: "Gemini 3 Pro（Google）" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash（Google）" },
      { id: "deepseek-ai/deepseek-v3.1", label: "DeepSeek V3.1" },
      { id: "deepseek-ai/deepseek-r1", label: "DeepSeek R1" },
      { id: "moonshotai/kimi-k2.6", label: "Kimi K2.6（Moonshot）" },
    ],
    defaultModel: "anthropic/claude-4.5-sonnet",
  },
  {
    id: "moonshot",
    label: "Kimi · Moonshot 官方",
    tab: "Kimi",
    kind: "openai",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    keyHint: "sk-… （Moonshot API Key）",
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
    models: [
      { id: "kimi-k3", label: "Kimi K3（旗舰 · 1M 上下文）" },
      { id: "kimi-k2.7-code", label: "Kimi K2.7 Code（编码）" },
      { id: "kimi-k2.6", label: "Kimi K2.6" },
      { id: "kimi-latest", label: "Kimi latest" },
      { id: "moonshot-v1-128k", label: "moonshot-v1-128k" },
      { id: "moonshot-v1-32k", label: "moonshot-v1-32k" },
      { id: "moonshot-v1-8k", label: "moonshot-v1-8k" },
    ],
    defaultModel: "kimi-k3",
  },
  {
    id: "zhipu",
    label: "GLM · 智谱官方",
    tab: "GLM",
    kind: "openai",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    keyHint: "…（智谱 API Key）",
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    models: [
      { id: "glm-4.6", label: "GLM-4.6" },
      { id: "glm-4.5", label: "GLM-4.5" },
      { id: "glm-4-plus", label: "GLM-4-Plus" },
      { id: "glm-4-flash", label: "GLM-4-Flash（免费）" },
    ],
    defaultModel: "glm-4.6",
  },
  {
    id: "deepseek",
    label: "DeepSeek 官方",
    tab: "DeepSeek",
    kind: "openai",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    keyHint: "sk-… （DeepSeek API Key）",
    keyUrl: "https://platform.deepseek.com/api_keys",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat（V3）" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner（R1）" },
    ],
    defaultModel: "deepseek-chat",
  },
];

/** AI 生图可选平台（与文本对话各配各的密钥） */
export const IMAGE_PROVIDERS: ProviderMeta[] = [
  {
    ...REPLICATE_BASE,
    models: [
      { id: "black-forest-labs/flux-1.1-pro-ultra", label: "FLUX 1.1 Pro Ultra" },
      { id: "black-forest-labs/flux-2-pro", label: "FLUX.2 Pro" },
      { id: "black-forest-labs/flux-schnell", label: "FLUX schnell（快·省）" },
      { id: "bytedance/seedream-4", label: "Seedream 4" },
      { id: "google/imagen-4", label: "Imagen 4（Google）" },
      { id: "google/nano-banana-pro", label: "Nano Banana Pro（Google）" },
      { id: "openai/gpt-image-1.5", label: "GPT Image 1.5（OpenAI）" },
    ],
    defaultModel: "black-forest-labs/flux-1.1-pro-ultra",
  },
  {
    id: "zhipu",
    label: "CogView · 智谱官方",
    tab: "GLM",
    kind: "openai",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    keyHint: "…（智谱 API Key）",
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    models: [
      { id: "cogview-4", label: "CogView-4" },
      { id: "cogview-3-flash", label: "CogView-3 Flash（免费）" },
    ],
    defaultModel: "cogview-4",
  },
];

export const PROVIDER_SCOPES: ProviderScope[] = ["chat", "image"];

export function isProviderScope(scope: string): scope is ProviderScope {
  return scope === "chat" || scope === "image";
}

/** 某个用途下的全部平台 */
export function providersOf(scope: ProviderScope): ProviderMeta[] {
  return scope === "chat" ? CHAT_PROVIDERS : IMAGE_PROVIDERS;
}

export function getProvider(scope: ProviderScope, id: string): ProviderMeta | undefined {
  return providersOf(scope).find((p) => p.id === id);
}

export function isProviderId(scope: ProviderScope, id: string): boolean {
  return providersOf(scope).some((p) => p.id === id);
}

/** 取实际接口地址：优先用户覆盖，否则平台默认 */
export function resolveBaseUrl(meta: ProviderMeta, override?: string): string {
  const url = (override || "").trim() || meta.defaultBaseUrl;
  return url.replace(/\/$/, "");
}
