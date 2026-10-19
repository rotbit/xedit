/**
 * Server-side transport for "send the model some text, get some text back". It does just this:
 * build the request, wait for the result, and map every provider's assorted errors to one set of error codes plus a Chinese message.
 *
 * The key is only used here, never in return values or error messages (there's also a final scrub at the end
 * in case upstream echoes the key in an error -- same approach as lib/coverGenerate/replicate).
 *
 * Two paths:
 * - openai: DeepSeek / OpenAI / Kimi / GLM, one POST and you have the result
 * - replicate: create a prediction first; Prefer: wait often returns in one go, otherwise poll
 */
import { type AiProvider } from "./providers";
import { tk } from "@/i18n/t";

const DEFAULT_TIMEOUT_SEC = 180;
const POLL_MS = 1200;
const RUNNING = ["starting", "processing"];
/**
 * Reviewing a long article only outputs a few thousand tokens of body, but this generation's "thinking" counts toward the output cap too,
 * so too small a cap lets thinking eat the budget and leaves the body empty. Generous but not unlimited: saves money and stops runaway models.
 */
const DEFAULT_MAX_TOKENS = 16000;
/** No reply should ever reach 1MB; if it does, upstream has probably gone haywire, so cut it off early instead of blowing up memory */
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

/** A failure with an error code. message is a sentence safe to show users, guaranteed not to contain the key */
export class AiError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface ChatRequest {
  provider: AiProvider;
  /** Model name that has already been sanitized (see providers.cleanModel) */
  model: string;
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  /** Whether to also enable the provider's JSON mode (only sent for providers with jsonMode) */
  json?: boolean;
}

export interface ChatDeps {
  /** For injection in unit tests; defaults to the global fetch */
  fetchImpl?: typeof fetch;
  /** Passed all the way down when the page disconnects, so abandoned requests don't keep burning quota */
  signal?: AbortSignal | null;
  timeoutSec?: number;
  pollMs?: number;
}

const clip = (s: unknown, n: number): string => {
  const text = String(s ?? "");
  return text.length > n ? `${text.slice(0, n)}…` : text;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** HTTP status → unified error code. Providers use status codes mostly the same way; the differences are in the body, which is only truncated */
function httpError(provider: AiProvider, status: number, detail: string): AiError {
  if (status === 401 || status === 403)
    return new AiError("bad_key", `${provider.label} 拒绝了这个 API Key，检查一下是不是填错或过期了`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  if (status === 402)
    return new AiError("billing", `${provider.label} 账户余额不足（或没开通这个模型）`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  if (status === 404)
    return new AiError("bad_input", `${provider.label} 没有这个模型，换一个再试：${clip(detail, 120)}`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  if (status === 429)
    return new AiError("rate_limited", `${provider.label} 限流了（也可能是额度用完），过一会儿再试`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  if (status === 400 || status === 422)
    return new AiError("bad_input", `${provider.label} 说请求不对：${clip(detail, 200)}`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  if (status >= 500) return new AiError("failed", `${provider.label} 服务端出错（HTTP ${status}）`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  return new AiError("failed", `${provider.label} 返回 HTTP ${status}`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
}

/** Pick a human-readable sentence from each provider's error body. Field names vary, so try them one by one */
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
 * Sends one chat request and returns plain text. All failures throw AiError.
 * The caller (route) decides where the key comes from and whether to rate limit; this only sends the request.
 */
export async function chatComplete(req: ChatRequest, deps: ChatDeps = {}): Promise<string> {
  const { provider, model, apiKey } = req;
  const { fetchImpl = fetch, signal = null, pollMs = POLL_MS } = deps;
  const key = apiKey.trim();
  if (!key) throw new AiError("no_key", `还没有配置 ${provider.label} 的 API Key`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  const timeoutSec = deps.timeoutSec && deps.timeoutSec > 0 ? deps.timeoutSec : DEFAULT_TIMEOUT_SEC;
  const deadline = Date.now() + timeoutSec * 1000;

  try {
    const text =
      provider.transport === "replicate" ? await viaReplicate() : await viaOpenAiCompatible();
    const out = text.trim();
    if (!out) throw new AiError("failed", `${provider.label} 返回了空回复`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
    return out.length > MAX_REPLY_CHARS ? out.slice(0, MAX_REPLY_CHARS) : out;
  } catch (e) {
    // Safety net: the key must never appear in an error message
    if (e instanceof Error && key && e.message.includes(key)) {
      e.message = e.message.split(key).join("***");
    }
    throw e;
  }

  /** OpenAI-compatible: DeepSeek / OpenAI / Kimi / GLM all share this path */
  async function viaOpenAiCompatible(): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      // No temperature: this generation of always-thinking models either ignores it or errors out (see providers.ts)
      [provider.tokensField]: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: false,
      ...provider.extra,
    };
    // Enable JSON mode where supported; for the rest, the prompt and the parser cover it
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
    // Most providers return a string; a few (those including reasoning) return an array of parts, so join them
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          typeof part === "string" ? part : String((part as { text?: unknown })?.text ?? "")
        )
        .join("");
    }
    throw new AiError("failed", `${provider.label} 的回复解析不出内容`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  }

  /**
   * Replicate: model names with ":version" go to /v1/predictions, otherwise to the "latest model version" endpoint.
   * Claude and GPT on Replicate both take prompt + system_prompt (only the output cap field name differs),
   * and the output is a list of chunks that must be joined for the full text. There's no temperature input, so it isn't sent.
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
      [provider.tokensField]: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...provider.extra,
    };
    const started = await callReplicate(url, {
      method: "POST",
      // If it's fast, this one request brings back the result and saves a polling round
      headers: { "Content-Type": "application/json", Prefer: "wait=60" },
      body: JSON.stringify({ ...(at > 0 ? { version: model.slice(at + 1) } : {}), input }),
    });

    let pred = started;
    while (RUNNING.includes(String(pred.status))) {
      if (Date.now() >= deadline) {
        // On timeout, make a best-effort cancel to save quota; if cancelling fails it doesn't matter, it'll finish on its own
        try {
          await callReplicate(pred.urls?.cancel, { method: "POST" });
        } catch {}
        throw new AiError("timeout", `${provider.label} 超时了（超过 ${timeoutSec} 秒）`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
      }
      await sleep(pollMs);
      pred = await callReplicate(pred.urls?.get);
    }
    if (pred.status !== "succeeded") {
      if (pred.status === "canceled") throw new AiError("aborted", tk("已取消"));
      throw new AiError("failed", `${provider.label} 调用失败：${clip(pred.error, 200) || "未知原因"}`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
    }
    const out = pred.output;
    if (typeof out === "string") return out;
    if (Array.isArray(out)) return out.map((chunk) => String(chunk ?? "")).join("");
    throw new AiError("failed", `${provider.label} 没有返回内容`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
  }

  /** Keyed requests may only go to Replicate: poll/cancel URLs come from upstream, so check the prefix before attaching the key */
  async function callReplicate(url: string | undefined, init: RequestInit = {}): Promise<Prediction> {
    if (typeof url !== "string" || !url.startsWith(`${provider.baseUrl}/`)) {
      throw new AiError("failed", tk("Replicate 返回了异常的接口地址，已中止"));
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

  /** Network-level errors are translated here; every request gets a timeout for the remaining time so a hung upstream can't stall us */
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
        throw new AiError("timeout", `${provider.label} 超时了（超过 ${timeoutSec} 秒）`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
      if (name === "AbortError") throw new AiError("aborted", tk("已取消"));
      throw new AiError("network", `连不上 ${provider.label}，检查下网络或代理`); // i18n-ignore server error message with variables; client t() can't match it, so it stays in Chinese for now
    }
  }
}

/** A Replicate prediction, with only the fields we use */
interface Prediction {
  status?: string;
  output?: unknown;
  error?: unknown;
  urls?: { get?: string; cancel?: string };
}
