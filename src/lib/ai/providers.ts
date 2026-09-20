/**
 * AI 供应商目录：审核（以及将来别的 AI 能力）认哪些家、每家有哪些模型、key 从哪来。
 *
 * 这份是纯数据，服务端与网页共用——设置面板要拿它列下拉框，服务端要拿它拼请求地址。
 * 所以这里不许出现 process.env（网页侧打包后读不到，只会得到 undefined）：
 * 站点自带的 key 由 serverKeys.ts 单独负责，那份只在服务端加载。
 *
 * 除 Replicate 外都是 OpenAI 兼容的 /chat/completions，所以传输层只写了两种（见 chat.ts）：
 * 国内这几家（DeepSeek / Kimi / 智谱）都照着 OpenAI 的报文抄，连字段名都一样。
 */

/** 传输方式：决定 chat.ts 走哪条代码路径 */
export type AiTransport = "openai" | "replicate";

export interface AiProvider {
  id: AiProviderId;
  /** 设置面板上显示的名字 */
  label: string;
  transport: AiTransport;
  /** 接口根地址，末尾不带斜杠；openai 传输会在后面接 /chat/completions */
  baseUrl: string;
  /** 站点自带 key 的环境变量名（服务端用，网页只拿它做提示文案） */
  envKey: string;
  /** 下拉框里的常用模型，第一个是默认 */
  models: string[];
  /** 认不认 response_format: json_object（认的话少一半解析失事） */
  jsonMode: boolean;
}

export type AiProviderId = "replicate" | "deepseek" | "openai" | "kimi" | "glm";

/**
 * Replicate 上 Anthropic 官方账号下的 Claude 全系。
 * Replicate 随时会上新（比如再出一版 opus），所以设置面板允许自己填模型名，
 * 这里列的只是「点一下就能用」的那几个，不是白名单——真正放行与否由 Replicate 说了算。
 */
const CLAUDE_ON_REPLICATE = [
  "anthropic/claude-4.5-sonnet",
  "anthropic/claude-4.5-haiku",
  "anthropic/claude-4.1-opus",
  "anthropic/claude-4-sonnet",
  "anthropic/claude-3.7-sonnet",
  "anthropic/claude-3.5-haiku",
];

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: "replicate",
    label: "Claude（Replicate）",
    transport: "replicate",
    baseUrl: "https://api.replicate.com",
    envKey: "REPLICATE_API_TOKEN",
    models: CLAUDE_ON_REPLICATE,
    // Replicate 转的是 Anthropic 的原生接口，没有 response_format 这一说
    jsonMode: false,
  },
  {
    id: "deepseek",
    label: "DeepSeek（官网）",
    transport: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    envKey: "DEEPSEEK_API_KEY",
    models: ["deepseek-chat", "deepseek-reasoner"],
    jsonMode: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    transport: "openai",
    baseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"],
    jsonMode: true,
  },
  {
    id: "kimi",
    label: "Kimi（月之暗面官网）",
    transport: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    envKey: "MOONSHOT_API_KEY",
    models: ["kimi-latest", "kimi-k2-turbo-preview", "moonshot-v1-32k", "moonshot-v1-128k"],
    jsonMode: true,
  },
  {
    id: "glm",
    label: "GLM（智谱官网）",
    transport: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    envKey: "ZHIPU_API_KEY",
    models: ["glm-4.6", "glm-4.5", "glm-4.5-air", "glm-4-flash"],
    jsonMode: true,
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

/** 默认那家：没配过的账号打开设置面板时停在这儿 */
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
