/**
 * 「给模型一段话，拿回一段话」的服务端传输层。只做这一件事：
 * 拼请求、等结果、把各家五花八门的报错翻成同一套错误码和一句中文。
 *
 * key 只在这里用，不进返回值、不进错误文案（末尾还有一道兜底擦除，
 * 防止上游把 key 回显在报错里——口径与 lib/coverGenerate/replicate 一致）。
 *
 * 两条路径：
 * - openai：DeepSeek / OpenAI / Kimi / GLM，一次 POST 就有结果
 * - replicate：先创建 prediction，Prefer: wait 常常一次就回来，没回来就轮询
 */
import { type AiProvider } from "./providers";

const DEFAULT_TIMEOUT_SEC = 120;
const POLL_MS = 1200;
const RUNNING = ["starting", "processing"];
/** 审核一篇长文的输出也就几千 token，给足但别无限：省钱也防止模型自说自话停不下来 */
const DEFAULT_MAX_TOKENS = 4000;
/** 回复再长也不至于到 1MB；超了多半是上游出了怪事，早点截断别撑爆内存 */
const MAX_REPLY_CHARS = 1_000_000;

export type AiErrorCode =
  | "no_key"
  | "bad_key"
  | "billing"
  | "rate_limited"
  | "timeout"
  | "aborted"
  | "network"
  | "bad_input"
  | "failed";

/** 带错误码的失败。message 是能直接给用户看的一句话，且保证不含 key */
export class AiError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface ChatRequest {
  provider: AiProvider;
  /** 已经洗过的模型名（见 providers.cleanModel） */
  model: string;
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  /** 要不要顺带开供应商的 JSON 模式（只有 jsonMode 的那几家会真的发出去） */
  json?: boolean;
}

export interface ChatDeps {
  /** 单测注入用；默认就是全局 fetch */
  fetchImpl?: typeof fetch;
  /** 网页断开时一路传下去，别让没人要的请求接着烧额度 */
  signal?: AbortSignal | null;
  timeoutSec?: number;
  pollMs?: number;
}

const clip = (s: unknown, n: number): string => {
  const text = String(s ?? "");
  return text.length > n ? `${text.slice(0, n)}…` : text;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** HTTP 状态 → 统一错误码。各家状态码用法基本一致，差别都在报文里，那部分只做截断 */
function httpError(provider: AiProvider, status: number, detail: string): AiError {
  if (status === 401 || status === 403)
    return new AiError("bad_key", `${provider.label} 拒绝了这个 API Key，检查一下是不是填错或过期了`);
  if (status === 402)
    return new AiError("billing", `${provider.label} 账户余额不足（或没开通这个模型）`);
  if (status === 404)
    return new AiError("bad_input", `${provider.label} 没有这个模型，换一个再试：${clip(detail, 120)}`);
  if (status === 429)
    return new AiError("rate_limited", `${provider.label} 限流了（也可能是额度用完），过一会儿再试`);
  if (status === 400 || status === 422)
    return new AiError("bad_input", `${provider.label} 说请求不对：${clip(detail, 200)}`);
  if (status >= 500) return new AiError("failed", `${provider.label} 服务端出错（HTTP ${status}）`);
  return new AiError("failed", `${provider.label} 返回 HTTP ${status}`);
}

/** 从各家的错误报文里挑一句人能看的。字段名各不相同，挨个试一遍 */
function detailOf(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;
  const err = b.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const m = (err as Record<string, unknown>).message;
    if (typeof m === "string") return m;
  }
  for (const key of ["detail", "message", "msg"]) {
    const v = b[key];
    if (typeof v === "string") return v;
  }
  return "";
}

/**
 * 发一次对话，拿回纯文本。失败一律抛 AiError。
 * 调用方（路由）负责决定 key 从哪来、要不要限流，这里只管发请求。
 */
export async function chatComplete(req: ChatRequest, deps: ChatDeps = {}): Promise<string> {
  const { provider, model, apiKey } = req;
  const { fetchImpl = fetch, signal = null, pollMs = POLL_MS } = deps;
  const key = apiKey.trim();
  if (!key) throw new AiError("no_key", `还没有配置 ${provider.label} 的 API Key`);
  const timeoutSec = deps.timeoutSec && deps.timeoutSec > 0 ? deps.timeoutSec : DEFAULT_TIMEOUT_SEC;
  const deadline = Date.now() + timeoutSec * 1000;

  try {
    const text =
      provider.transport === "replicate" ? await viaReplicate() : await viaOpenAiCompatible();
    const out = text.trim();
    if (!out) throw new AiError("failed", `${provider.label} 返回了空回复`);
    return out.length > MAX_REPLY_CHARS ? out.slice(0, MAX_REPLY_CHARS) : out;
  } catch (e) {
    // 兜底：key 绝不能出现在错误文案里
    if (e instanceof Error && key && e.message.includes(key)) {
      e.message = e.message.split(key).join("***");
    }
    throw e;
  }

  /** OpenAI 兼容：DeepSeek / OpenAI / Kimi / GLM 共用这一条 */
  async function viaOpenAiCompatible(): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      // 审核要的是稳定复现，不是花样：温度压到很低
      temperature: 0.2,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: false,
    };
    // 认 JSON 模式的就顺手开上；不认的那几家靠提示词和解析端兜着
    if (req.json && provider.jsonMode) body.response_format = { type: "json_object" };

    const res = await request(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    const parsed = await readJson(res);
    if (!res.ok) throw httpError(provider, res.status, detailOf(parsed));

    const choices = (parsed as { choices?: unknown })?.choices;
    const first = Array.isArray(choices) ? choices[0] : null;
    const message = (first as { message?: { content?: unknown } } | null)?.message;
    const content = message?.content;
    // 绝大多数家给的是字符串；少数（含推理过程的那种）给的是分段数组，拼起来
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          typeof part === "string" ? part : String((part as { text?: unknown })?.text ?? "")
        )
        .join("");
    }
    throw new AiError("failed", `${provider.label} 的回复解析不出内容`);
  }

  /**
   * Replicate：模型名带 ":版本号" 时走 /v1/predictions，否则走「模型最新版」那个接口。
   * Claude 在 Replicate 上的入参是 prompt + system_prompt，输出是一串分片，拼起来才是全文。
   */
  async function viaReplicate(): Promise<string> {
    const at = model.indexOf(":");
    const url =
      at > 0
        ? `${provider.baseUrl}/v1/predictions`
        : `${provider.baseUrl}/v1/models/${model}/predictions`;
    const input: Record<string, unknown> = {
      prompt: req.user,
      system_prompt: req.system,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: 0.2,
    };
    const started = await callReplicate(url, {
      method: "POST",
      // 快的话这一次请求就把结果带回来了，省掉一轮轮询
      headers: { "Content-Type": "application/json", Prefer: "wait=60" },
      body: JSON.stringify({ ...(at > 0 ? { version: model.slice(at + 1) } : {}), input }),
    });

    let pred = started;
    while (RUNNING.includes(String(pred.status))) {
      if (Date.now() >= deadline) {
        // 超时了尽力打个取消，省点额度；取消失败无所谓，那边自己会结束
        try {
          await callReplicate(pred.urls?.cancel, { method: "POST" });
        } catch {}
        throw new AiError("timeout", `${provider.label} 超时了（超过 ${timeoutSec} 秒）`);
      }
      await sleep(pollMs);
      pred = await callReplicate(pred.urls?.get);
    }
    if (pred.status !== "succeeded") {
      if (pred.status === "canceled") throw new AiError("aborted", "已取消");
      throw new AiError("failed", `${provider.label} 调用失败：${clip(pred.error, 200) || "未知原因"}`);
    }
    const out = pred.output;
    if (typeof out === "string") return out;
    if (Array.isArray(out)) return out.map((chunk) => String(chunk ?? "")).join("");
    throw new AiError("failed", `${provider.label} 没有返回内容`);
  }

  /** 带 key 的请求只许发给 Replicate：轮询/取消地址是上游给的，先核对前缀再决定带不带 key */
  async function callReplicate(url: string | undefined, init: RequestInit = {}): Promise<Prediction> {
    if (typeof url !== "string" || !url.startsWith(`${provider.baseUrl}/`)) {
      throw new AiError("failed", "Replicate 返回了异常的接口地址，已中止");
    }
    const res = await request(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${key}` },
    });
    const parsed = await readJson(res);
    if (!res.ok) throw httpError(provider, res.status, detailOf(parsed));
    return (parsed ?? {}) as Prediction;
  }

  async function readJson(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  /** 网络层异常在这里统一翻译；每次请求都套一道剩余时间的超时，避免上游挂住不返回 */
  async function request(url: string, init: RequestInit): Promise<Response> {
    const timer = AbortSignal.timeout(Math.max(1000, deadline - Date.now()));
    try {
      return await fetchImpl(url, {
        ...init,
        signal: signal ? AbortSignal.any([signal, timer]) : timer,
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "TimeoutError")
        throw new AiError("timeout", `${provider.label} 超时了（超过 ${timeoutSec} 秒）`);
      if (name === "AbortError") throw new AiError("aborted", "已取消");
      throw new AiError("network", `连不上 ${provider.label}，检查下网络或代理`);
    }
  }
}

/** Replicate 的 prediction，只挑用得上的字段 */
interface Prediction {
  status?: string;
  output?: unknown;
  error?: unknown;
  urls?: { get?: string; cancel?: string };
}
