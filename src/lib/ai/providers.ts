/**
 * AI 供应商目录：审核（以及将来别的 AI 能力）认哪些家、每家有哪些模型、key 从哪来。
 *
 * 这份是纯数据，服务端与网页共用——设置面板要拿它列下拉框，服务端要拿它拼请求地址。
 * 所以这里不许出现 process.env（网页侧打包后读不到，只会得到 undefined）：
 * key 由 siteSettings.ts 单独负责（后台填的 + 环境变量兜底），那份只在服务端加载。
 *
 * 传输层只有两种（见 chat.ts）：OpenAI 兼容的 /chat/completions，和 Replicate 的 predictions。
 * 国内这几家（DeepSeek / Kimi / 智谱）都照着 OpenAI 的报文抄，连字段名都一样。
 *
 * 模型清单 2026-09 按各家官网核对过。这一代旗舰几乎都强制开着「思考」，带来三条共性：
 * - temperature 要么被忽略要么直接报错（Kimi K3、GPT-5 以后），所以一律不传；
 * - 输出上限把思考的 token 也算在内，给少了正文会是空的（见 chat.ts 的 DEFAULT_MAX_TOKENS）；
 * - 思考强度能调的都调到 low：审稿要的是快和稳，不是解奥数题。
 */

/** 传输方式：决定 chat.ts 走哪条代码路径 */
export type AiTransport = "openai" | "replicate";

export interface AiProvider {
  id: AiProviderId;
  /** 后台设置面板上显示的名字 */
  label: string;
  transport: AiTransport;
  /** 接口根地址，末尾不带斜杠；openai 传输会在后面接 /chat/completions */
  baseUrl: string;
  /**
   * 这家的 key 占哪个槽位，同时也是兜底的环境变量名。
   * Replicate 上的 Claude 和 GPT 是两个供应商、同一个槽位：一把 token 两边通用。
   */
  envKey: string;
  /** 下拉框里的常用模型，第一个是默认 */
  models: string[];
  /** 认不认 response_format: json_object（认的话少一半解析失事） */
  jsonMode: boolean;
  /** 输出上限那个字段叫什么：老牌叫 max_tokens，新一代（OpenAI / Kimi）只认 max_completion_tokens */
  tokensField: "max_tokens" | "max_completion_tokens";
  /** 这家特有的固定入参（多半是把思考强度压到 low），原样并进请求体 */
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
 * Replicate 上两个官方账号下的模型。Replicate 随时会上新，所以后台允许自己填模型名，
 * 这里列的只是「点一下就能用」的那几个，不是白名单——真正放行与否由 Replicate 说了算。
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
    label: "DeepSeek（官网）",
    transport: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    envKey: "DEEPSEEK_API_KEY",
    // V4 这一代改了名字：flash 是便宜快的那档，v4-pro 是旗舰
    models: ["deepseek-flash", "deepseek-v4-pro"],
    jsonMode: true,
    tokensField: "max_tokens",
  },
  {
    id: "replicate",
    label: "Claude（Replicate）",
    transport: "replicate",
    baseUrl: "https://api.replicate.com",
    envKey: "REPLICATE_API_TOKEN",
    models: CLAUDE_ON_REPLICATE,
    // Replicate 转的是各家的原生接口，没有 response_format 这一说
    jsonMode: false,
    tokensField: "max_tokens",
  },
  {
    id: "replicate-gpt",
    label: "GPT（Replicate）",
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
    label: "GPT（OpenAI 官网）",
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
    label: "Kimi（月之暗面官网）",
    transport: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    envKey: "MOONSHOT_API_KEY",
    models: ["kimi-k3", "kimi-k2.6"],
    // K3 的文档只写了 json_schema，没提 json_object；不赌，靠提示词和解析端兜着
    jsonMode: false,
    tokensField: "max_completion_tokens",
    extra: { reasoning_effort: "low" },
  },
  {
    id: "glm",
    label: "GLM（智谱官网）",
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

/** 认不认这个供应商 id */
export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && BY_ID.has(value as AiProviderId);
}

/** 取一家；不认识的一律返回 null，由调用方决定是报错还是回退 */
export function aiProvider(id: unknown): AiProvider | null {
  return isAiProviderId(id) ? (BY_ID.get(id) ?? null) : null;
}

/** 默认那家：后台没改过的话，全站的 AI 审核就用它（用户点名要 DeepSeek） */
export const DEFAULT_AI_PROVIDER: AiProviderId = "deepseek";

/**
 * 模型名的洗法。自定义模型是一个自由输入框，而它最终会被拼进 URL（Replicate）
 * 或原样发给上游，所以这里只放行模型名里真正用得上的那几类字符。
 */
export function cleanModel(value: unknown, provider: AiProvider): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const safe = raw.replace(/[^A-Za-z0-9._:\-/]/g, "").slice(0, 120);
  return safe || provider.models[0];
}
