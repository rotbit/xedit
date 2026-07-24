/**
 * AI 平台目录：平台元信息与模型候选，前后端共用，不含任何密钥。
 *
 * 两类接入：
 * - replicate：一个 token 覆盖 openai/claude/gemini/deepseek/kimi 等全部家族（原生 prediction 接口）
 * - openai 兼容：kimi(moonshot) / glm(zhipu) / deepseek 各自官方接口
 */

export type ProviderId = "replicate" | "moonshot" | "zhipu" | "deepseek";
export type ProviderKind = "replicate" | "openai";

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderMeta {
  id: ProviderId;
  /** 展示名 */
  label: string;
  kind: ProviderKind;
  /** openai 兼容平台的默认接口地址；replicate 固定不用改 */
  defaultBaseUrl: string;
  keyHint: string;
  /** 申领 Key 的页面 */
  keyUrl: string;
  note?: string;
  chatModels: ModelOption[];
  imageModels: ModelOption[];
  defaultChatModel: string;
  defaultImageModel: string;
}

const REPLICATE: ProviderMeta = {
  id: "replicate",
  label: "Replicate（openai/claude/gemini…）",
  kind: "replicate",
  defaultBaseUrl: "https://api.replicate.com/v1",
  keyHint: "r8_… （Replicate API token）",
  keyUrl: "https://replicate.com/account/api-tokens",
  note: "一个 token 即可调用下列全部模型；也可直接填任意 owner/name 形式的模型名。",
  chatModels: [
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
    { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5（Moonshot）" },
  ],
  imageModels: [
    { id: "black-forest-labs/flux-1.1-pro-ultra", label: "FLUX 1.1 Pro Ultra" },
    { id: "black-forest-labs/flux-2-pro", label: "FLUX.2 Pro" },
    { id: "black-forest-labs/flux-schnell", label: "FLUX schnell（快·省）" },
    { id: "bytedance/seedream-4", label: "Seedream 4" },
    { id: "google/imagen-4", label: "Imagen 4（Google）" },
    { id: "google/nano-banana-pro", label: "Nano Banana Pro（Google）" },
    { id: "openai/gpt-image-1.5", label: "GPT Image 1.5（OpenAI）" },
  ],
  defaultChatModel: "anthropic/claude-4.5-sonnet",
  defaultImageModel: "black-forest-labs/flux-1.1-pro-ultra",
};

const MOONSHOT: ProviderMeta = {
  id: "moonshot",
  label: "Kimi · Moonshot 官方",
  kind: "openai",
  defaultBaseUrl: "https://api.moonshot.cn/v1",
  keyHint: "sk-… （Moonshot API Key）",
  keyUrl: "https://platform.moonshot.cn/console/api-keys",
  chatModels: [
    { id: "kimi-k2-0905-preview", label: "Kimi K2（0905）" },
    { id: "kimi-latest", label: "Kimi latest" },
    { id: "moonshot-v1-128k", label: "moonshot-v1-128k" },
    { id: "moonshot-v1-32k", label: "moonshot-v1-32k" },
    { id: "moonshot-v1-8k", label: "moonshot-v1-8k" },
  ],
  imageModels: [],
  defaultChatModel: "kimi-k2-0905-preview",
  defaultImageModel: "",
};

const ZHIPU: ProviderMeta = {
  id: "zhipu",
  label: "GLM · 智谱官方",
  kind: "openai",
  defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
  keyHint: "…（智谱 API Key）",
  keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
  chatModels: [
    { id: "glm-4.6", label: "GLM-4.6" },
    { id: "glm-4.5", label: "GLM-4.5" },
    { id: "glm-4-plus", label: "GLM-4-Plus" },
    { id: "glm-4-flash", label: "GLM-4-Flash（免费）" },
  ],
  imageModels: [
    { id: "cogview-4", label: "CogView-4" },
    { id: "cogview-3-flash", label: "CogView-3 Flash（免费）" },
  ],
  defaultChatModel: "glm-4.6",
  defaultImageModel: "cogview-4",
};

const DEEPSEEK: ProviderMeta = {
  id: "deepseek",
  label: "DeepSeek 官方",
  kind: "openai",
  defaultBaseUrl: "https://api.deepseek.com/v1",
  keyHint: "sk-… （DeepSeek API Key）",
  keyUrl: "https://platform.deepseek.com/api_keys",
  chatModels: [
    { id: "deepseek-chat", label: "DeepSeek Chat（V3）" },
    { id: "deepseek-reasoner", label: "DeepSeek Reasoner（R1）" },
  ],
  imageModels: [],
  defaultChatModel: "deepseek-chat",
  defaultImageModel: "",
};

export const PROVIDERS: ProviderMeta[] = [REPLICATE, MOONSHOT, ZHIPU, DEEPSEEK];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id) as ProviderId[];

export function getProvider(id: string): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isProviderId(id: string): id is ProviderId {
  return PROVIDER_IDS.includes(id as ProviderId);
}

/** 支持文本对话的平台（全部） */
export const CHAT_PROVIDERS = PROVIDERS.filter((p) => p.chatModels.length > 0);

/** 支持生图的平台（replicate / zhipu） */
export const IMAGE_PROVIDERS = PROVIDERS.filter((p) => p.imageModels.length > 0);

/** 取实际接口地址：优先用户覆盖，否则平台默认 */
export function resolveBaseUrl(meta: ProviderMeta, override?: string): string {
  const url = (override || "").trim() || meta.defaultBaseUrl;
  return url.replace(/\/$/, "");
}
