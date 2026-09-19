/**
 * AI 生成公众号封面：服务端拿站点的 Replicate Token 去生图，图片下载成 dataURL 回给网页。
 * Token 只在这里用，返回、日志、错误文案都不会带上它（末尾还有一道兜底擦除，防止上游把它回显出来）。
 * 图片不落盘：封面最终跟着文章走（存进文库或传 OSS），服务端再留一份只会攒出没人清理的临时文件。
 */
const API_BASE = "https://api.replicate.com/";
/** 用户描述最多取这么多字：再长也只是把模型带偏 */
const MAX_PROMPT = 600;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const POLL_MS = 1500;
const RUNNING = ["starting", "processing"];
/** 几秒一张、按张收费里最便宜的一档；换模型只要改 REPLICATE_MODEL */
const DEFAULT_MODEL = "black-forest-labs/flux-schnell";
const DEFAULT_TIMEOUT_SEC = 90;
const DEFAULT_DAILY_LIMIT = 20;
/** 一次最多几张：两张够挑，再多既慢又贵 */
const MAX_COUNT = 2;

export const COVER_STYLES = ["minimal", "illustration", "photo", "tech"] as const;
export type CoverStyle = (typeof COVER_STYLES)[number];

/** 风格后缀：网页上点一下就有，不用用户自己写英文提示词 */
const STYLE_SUFFIX: Record<CoverStyle, string> = {
  minimal: "minimalist style, generous negative space, flat shapes, soft muted color palette",
  illustration: "modern flat vector illustration, clean shapes",
  photo: "realistic photography, natural light, shallow depth of field",
  tech: "futuristic technology aesthetic, dark background, geometric light effects",
};

// 约束用英文写：生图模型吃英文更稳。主体居中是因为公众号列表页会把封面裁成居中的方图
const CONSTRAINTS =
  "wide 21:9 banner composition, main subject centered, no text, no letters, no watermark, no logo, clean background";

/** 失败码：路由据此定 HTTP 状态，网页据此决定怎么提示 */
export type CoverErrorCode =
  | "no_token"
  | "bad_input"
  | "bad_token"
  | "billing"
  | "rate_limited"
  | "timeout"
  | "aborted"
  | "network"
  | "failed";

/** 带错误码的失败。message 是能直接给用户看的一句话，且保证不含 Token */
export class CoverError extends Error {
  code: CoverErrorCode;
  constructor(code: CoverErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function isCoverStyle(value: unknown): value is CoverStyle {
  return typeof value === "string" && (COVER_STYLES as readonly string[]).includes(value);
}

/** 站点配没配 AI 生成封面（/api/config 据此告诉网页这个功能有没有） */
export function coverGenerateConfigured(): boolean {
  return Boolean(process.env.REPLICATE_API_TOKEN?.trim());
}

/** 每个账号每个自然日最多生成几次；没配或填得不合法都按 20 */
export function coverDailyLimit(): number {
  const n = Number(process.env.COVER_GENERATE_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_LIMIT;
}

/** 一次生几张：非法值按 1 张，上限 2 张（路由与这里各夹一道，两边都不信调用方） */
export function clampCoverCount(count: unknown): number {
  return Math.min(MAX_COUNT, Math.max(1, Math.round(Number(count)) || 1));
}

const clip = (s: unknown, n: number): string => {
  const text = String(s ?? "");
  return text.length > n ? `${text.slice(0, n)}…` : text;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 提示词由固定模板拼出来：调用方只能决定「画什么」和风格，改不掉后面那串约束
export function buildPrompt(prompt: string, style?: string | null): string {
  const parts = [`WeChat article cover banner about: ${String(prompt ?? "").slice(0, MAX_PROMPT)}`];
  if (isCoverStyle(style)) parts.push(STYLE_SUFFIX[style]);
  parts.push(CONSTRAINTS);
  return parts.join(". ");
}

// HTTP 状态 → 统一的错误码与中文说法
function httpError(status: number, body: { detail?: unknown } | null): CoverError {
  if (status === 401 || status === 403)
    return new CoverError("bad_token", "Replicate 拒绝了站点的 Token，请检查服务端配置");
  if (status === 402) return new CoverError("billing", "站点的 Replicate 账户余额不足");
  if (status === 422)
    return new CoverError("bad_input", `Replicate 说提示词或参数不对：${clip(body?.detail, 200)}`);
  if (status === 429) return new CoverError("rate_limited", "生图服务正忙，稍后再试");
  return new CoverError("failed", `Replicate 返回 HTTP ${status}`);
}

/** Replicate 的 prediction，只挑用得上的字段 */
interface Prediction {
  status?: string;
  output?: unknown;
  error?: unknown;
  urls?: { get?: string; cancel?: string };
  /** 出错时这一版返回的是 { detail }，不是 prediction */
  detail?: unknown;
}

export interface CoverRequest {
  prompt: string;
  style?: string | null;
  count?: number;
}

export interface CoverDeps {
  /** 单测注入用；默认就是全局 fetch */
  fetchImpl?: typeof fetch;
  /** 客户端断开时一路传下去，好把上游的生成也取消掉 */
  signal?: AbortSignal | null;
  pollMs?: number;
}

/** { prompt, style, count } → dataURL 数组。失败一律抛 CoverError */
export async function generateCovers(
  { prompt, style, count }: CoverRequest,
  { fetchImpl = fetch, signal = null, pollMs = POLL_MS }: CoverDeps = {}
): Promise<string[]> {
  const token = process.env.REPLICATE_API_TOKEN?.trim() ?? "";
  if (!token) throw new CoverError("no_token", "服务端还没有配置 AI 生成封面");
  const wanted = String(prompt ?? "").trim();
  if (!wanted) throw new CoverError("bad_input", "封面描述是空的，写一句想画什么");
  const n = clampCoverCount(count);
  const model = process.env.REPLICATE_MODEL?.trim() || DEFAULT_MODEL;
  const configured = Number(process.env.COVER_GENERATE_TIMEOUT_SEC);
  const timeoutSec = configured > 0 ? configured : DEFAULT_TIMEOUT_SEC;
  const deadline = Date.now() + timeoutSec * 1000;

  try {
    return await run();
  } catch (e) {
    // 兜底：Token 绝不能出现在错误文案里
    if (e instanceof Error && e.message.includes(token)) {
      e.message = e.message.split(token).join("***");
    }
    throw e;
  }

  async function run(): Promise<string[]> {
    const input = {
      prompt: buildPrompt(wanted, style),
      aspect_ratio: "21:9",
      num_outputs: n,
      output_format: "jpg",
      output_quality: 90,
    };
    // 模型写成 owner/name:hash 时走带版本号的接口，否则用「模型最新版」那个接口
    const at = model.indexOf(":");
    const url = at > 0 ? `${API_BASE}v1/predictions` : `${API_BASE}v1/models/${model}/predictions`;
    const body = at > 0 ? { version: model.slice(at + 1), input } : { input };
    // Prefer: wait 让快模型（flux-schnell 几秒就好）在这一次请求里直接返回结果，省掉轮询
    let pred = await callApi(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "wait=60" },
      body: JSON.stringify(body),
    });
    while (RUNNING.includes(String(pred.status))) {
      if (Date.now() >= deadline) {
        // 超时了尽力打个取消，省点额度；取消失败无所谓，那边自己会结束
        try {
          await callApi(pred.urls?.cancel, { method: "POST" });
        } catch {}
        throw new CoverError("timeout", `生成超时了（超过 ${timeoutSec} 秒），稍后再试`);
      }
      await sleep(pollMs);
      pred = await callApi(pred.urls?.get);
    }
    if (pred.status !== "succeeded") {
      if (pred.status === "canceled") throw new CoverError("failed", "生成被取消了");
      const why = String(pred.error ?? "");
      if (/nsfw|safety|sensitive/i.test(why))
        throw new CoverError("failed", "提示词被内容安全策略拦下了，换个说法试试");
      throw new CoverError("failed", `生成失败：${clip(why, 200) || "未知原因"}`);
    }
    const outputs = (Array.isArray(pred.output) ? pred.output : [pred.output]).filter(
      (u): u is string => typeof u === "string" && u !== ""
    );
    if (outputs.length === 0) throw new CoverError("failed", "生成完了却没拿到图片");
    const images: string[] = [];
    for (const one of outputs.slice(0, n)) images.push(await download(one));
    return images;
  }

  // 带 Token 的请求只许发给 Replicate：轮询/取消地址是上游给的，先核对域名再决定要不要带 Token 过去
  async function callApi(url: string | undefined, init: RequestInit = {}): Promise<Prediction> {
    if (typeof url !== "string" || !url.startsWith(API_BASE)) {
      throw new CoverError("failed", "Replicate 返回了异常的接口地址，已中止");
    }
    const res = await request(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
    let body: Prediction | null = null;
    try {
      body = (await res.json()) as Prediction;
    } catch {}
    if (!res.ok) throw httpError(res.status, body);
    return body ?? {};
  }

  // 图片在 CDN 上，这一步一定不带 Authorization——Token 没必要离开 api.replicate.com
  async function download(url: string): Promise<string> {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      throw new CoverError("failed", "图片地址不合法");
    }
    if (target.protocol !== "https:") throw new CoverError("failed", "图片地址不是 https，已中止");
    const res = await request(target.href, {});
    if (!res.ok) throw new CoverError("failed", `图片下载失败（HTTP ${res.status}）`);
    const header = (name: string) => String(res.headers?.get(name) ?? "");
    const type = header("content-type").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) throw new CoverError("failed", "下载到的不是图片");
    if (Number(header("content-length")) > MAX_IMAGE_BYTES)
      throw new CoverError("failed", "生成的图片太大（超过 8MB）");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) throw new CoverError("failed", "生成的图片太大（超过 8MB）");
    return `data:${type};base64,${buf.toString("base64")}`;
  }

  // 网络层异常在这里统一翻译；每次请求都套一道剩余时间的超时，避免上游挂住不返回
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
        throw new CoverError("timeout", `生成超时了（超过 ${timeoutSec} 秒），稍后再试`);
      if (name === "AbortError") throw new CoverError("aborted", "已取消");
      throw new CoverError("network", "连不上生图服务，请稍后再试");
    }
  }
}
