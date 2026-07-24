/**
 * Replicate 原生适配层。
 *
 * Replicate 不提供标准的 /chat/completions，而是「创建 prediction → 流式或轮询取结果」的模型。
 * 这里把它包装成：
 * - 文本流式：输出与 OpenAI SSE 完全一致（data: {choices:[{delta:{content}}]}），前端无需改动。
 * - 文本一次性 / 生图：用 `Prefer: wait` 同步等待，必要时轮询。
 * 不同模型的输入字段不一致，统一先试 { prompt, system_prompt }，遇 422 回退到把 system 拼进 prompt。
 */

const DEFAULT_BASE = "https://api.replicate.com/v1";
const WAIT_SECONDS = 60;
const POLL_TIMEOUT_MS = 110_000;
const POLL_INTERVAL_MS = 1500;

interface Prediction {
  id?: string;
  status?: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string | null;
  urls?: { get?: string; stream?: string; cancel?: string };
}

function base(baseUrl?: string): string {
  return (baseUrl || DEFAULT_BASE).replace(/\/$/, "");
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Replicate 输出（string | string[] | 其它）归一成文本 */
function joinOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.map((x) => (typeof x === "string" ? x : "")).join("");
  return "";
}

/** 从输出里取第一个 URL（生图） */
function firstUrl(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    for (const x of output) if (typeof x === "string" && /^https?:\/\//.test(x)) return x;
  }
  if (output && typeof output === "object") {
    const url = (output as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return "";
}

class ReplicateError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function createPrediction(
  model: string,
  token: string,
  input: Record<string, unknown>,
  opts: { stream?: boolean; wait?: boolean; baseUrl?: string; signal?: AbortSignal }
): Promise<Prediction> {
  const headers = authHeaders(token);
  if (opts.wait) headers["Prefer"] = `wait=${WAIT_SECONDS}`;
  const res = await fetch(`${base(opts.baseUrl)}/models/${model}/predictions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...(opts.stream ? { stream: true } : {}), input }),
    signal: opts.signal,
  });
  const data = (await res.json().catch(() => null)) as (Prediction & { detail?: string }) | null;
  if (!res.ok) {
    const message = data?.detail || data?.error || `Replicate 返回 ${res.status}`;
    throw new ReplicateError(message, res.status);
  }
  return data ?? {};
}

/**
 * 创建 prediction，输入字段容错：先带 system_prompt，遇 422（字段不被模型接受）回退到把
 * system 直接拼进 prompt。extraInput 用于生图（如 aspect_ratio），同样在 422 时被丢弃。
 */
async function createWithFallback(
  model: string,
  token: string,
  system: string,
  prompt: string,
  extraInput: Record<string, unknown>,
  opts: { stream?: boolean; wait?: boolean; baseUrl?: string; signal?: AbortSignal }
): Promise<Prediction> {
  try {
    const input: Record<string, unknown> = { prompt, ...extraInput };
    if (system) input.system_prompt = system;
    return await createPrediction(model, token, input, opts);
  } catch (e) {
    if (e instanceof ReplicateError && e.status === 422) {
      const merged = system ? `${system}\n\n${prompt}` : prompt;
      return await createPrediction(model, token, { prompt: merged }, opts);
    }
    throw e;
  }
}

async function poll(url: string, token: string, signal?: AbortSignal): Promise<Prediction> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const res = await fetch(url, { headers: authHeaders(token), signal });
    const data = (await res.json().catch(() => null)) as Prediction | null;
    const status = data?.status;
    if (status === "succeeded") return data!;
    if (status === "failed" || status === "canceled") {
      throw new Error(data?.error || "Replicate 生成失败");
    }
    if (Date.now() > deadline) throw new Error("Replicate 生成超时");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/** 文本一次性对话，返回完整文本 */
export async function replicateChatOnce(args: {
  model: string;
  token: string;
  system?: string;
  prompt: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const pred = await createWithFallback(
    args.model,
    args.token,
    args.system ?? "",
    args.prompt,
    {},
    { wait: true, baseUrl: args.baseUrl, signal: args.signal }
  );
  const done =
    pred.status === "succeeded" || !pred.urls?.get
      ? pred
      : await poll(pred.urls.get, args.token, args.signal);
  if (done.status === "failed" || done.status === "canceled") {
    throw new Error(done.error || "Replicate 生成失败");
  }
  return joinOutput(done.output);
}

const encoder = new TextEncoder();

/** 把一段文本增量包成 OpenAI 兼容 SSE */
function sseDelta(content: string): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
}

/**
 * 文本流式对话，返回可直接作为 Response body 的 ReadableStream，
 * 内容为 OpenAI 兼容 SSE（末尾 data: [DONE]）。
 */
export async function replicateChatStream(args: {
  model: string;
  token: string;
  system?: string;
  prompt: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const pred = await createWithFallback(
    args.model,
    args.token,
    args.system ?? "",
    args.prompt,
    {},
    { stream: true, baseUrl: args.baseUrl, signal: args.signal }
  );
  const streamUrl = pred.urls?.stream;

  // 模型不支持流式：退回一次性，再一把吐出
  if (!streamUrl) {
    const text = await replicateChatOnce(args);
    return new ReadableStream({
      start(controller) {
        if (text) controller.enqueue(sseDelta(text));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
  }

  const upstream = await fetch(streamUrl, {
    headers: { Accept: "text/event-stream", Authorization: `Bearer ${args.token}` },
    signal: args.signal,
  });
  if (!upstream.ok || !upstream.body) {
    throw new Error(`Replicate 流式连接失败（${upstream.status}）`);
  }
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async pull(controller) {
      let buffer = "";
      // 逐事件解析：空行分隔，data 多行以 \n 连接，event 决定类型
      let eventName = "";
      let dataLines: string[] = [];
      const flush = (): boolean => {
        if (eventName === "done") return true;
        if (eventName === "output" && dataLines.length) {
          controller.enqueue(sseDelta(dataLines.join("\n")));
        }
        eventName = "";
        dataLines = [];
        return false;
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.replace(/\r$/, "");
          if (line === "") {
            if (flush()) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }
            continue;
          }
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
        }
      }
      flush();
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}

/** 生图，返回图片 URL（Replicate 托管的临时地址，调用方应转存图床） */
export async function replicateImageUrl(args: {
  model: string;
  token: string;
  prompt: string;
  aspectRatio?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const extra = args.aspectRatio ? { aspect_ratio: args.aspectRatio } : {};
  const pred = await createWithFallback(
    args.model,
    args.token,
    "",
    args.prompt,
    extra,
    { wait: true, baseUrl: args.baseUrl, signal: args.signal }
  );
  const done =
    pred.status === "succeeded" || !pred.urls?.get
      ? pred
      : await poll(pred.urls.get, args.token, args.signal);
  if (done.status === "failed" || done.status === "canceled") {
    throw new Error(done.error || "Replicate 生图失败");
  }
  const url = firstUrl(done.output);
  if (!url) throw new Error("Replicate 未返回图片");
  return url;
}
