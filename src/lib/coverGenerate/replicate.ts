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

// 约束用英文写：生图模型吃英文更稳。比例跟着实际下发的 aspect_ratio 走（模型不认 21:9 时会换掉），
// 免得提示词和入参各说一套。主体居中是因为公众号列表页会把封面裁成居中的方图
const constraints = (aspect: string) =>
  `wide ${aspect} banner composition, main subject centered, no text, no letters, no watermark, no logo, clean background`;

/** 默认比例：flux-schnell 认，也够宽，像个 banner。别的模型不认时会被下面的自适应换掉 */
const DEFAULT_ASPECT = "21:9";
/** 模型不认就可以摘掉的可选入参：真正非有不可的只有 prompt */
const OPTIONAL_INPUT = ["num_outputs", "output_format", "output_quality"] as const;
/** 入参自适应最多重试几次：上游一次点一个字段的名，总得有个头，别在这儿转死循环 */
const MAX_INPUT_RETRY = 3;

/**
 * 每个模型吃什么入参，撞一次 422 就记下来：aspect_ratio 该填哪个值、哪些可选字段不能发。
 * Replicate 每个模型的 input schema 都不一样（21:9 是 flux-schnell 认，换个模型就 422），
 * 与其写死另一个值，不如按模型记住上一次谈成的那版，之后的请求不用每次先撞一次。
 * 只在进程内存里，重启即失效——丢了也不过是再撞一次 422。
 */
const MODEL_INPUT = new Map<string, { aspectRatio?: string; drop: Set<string> }>();

/** 单测用：模块级缓存复位（测试之间不互相污染） */
export function __resetCoverModelsForTests() {
  MODEL_INPUT.clear();
}

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

// 提示词由固定模板拼出来：调用方只能决定「画什么」和风格，改不掉后面那串约束。
// aspect 是这次真要下发的比例，默认还是 21:9
export function buildPrompt(prompt: string, style?: string | null, aspect = DEFAULT_ASPECT): string {
  const parts = [`WeChat article cover banner about: ${String(prompt ?? "").slice(0, MAX_PROMPT)}`];
  if (isCoverStyle(style)) parts.push(STYLE_SUFFIX[style]);
  parts.push(constraints(aspect));
  return parts.join(". ");
}

/**
 * 从 422 的 detail 里挑一个模型认的比例：只认 "W:H" 写法（auto、1536x1024 这种像素值不算），
 * 取其中最宽的那个横向比例——封面是横幅，换成方图或竖图还不如不换。
 * 挑不出来（或者只剩已经试过的那个）就返回 null，由调用方按原样报错。
 */
function widestAspect(detail: string, tried: Set<string>): string | null {
  let best: string | null = null;
  let widest = 1; // 起点就是 1:1：比它还窄的一律不要
  for (const [, w, h] of detail.matchAll(/(\d{1,4})\s*:\s*(\d{1,4})/g)) {
    const ratio = Number(w) / Number(h);
    const value = `${Number(w)}:${Number(h)}`;
    if (!Number.isFinite(ratio) || ratio <= widest || tried.has(value)) continue;
    best = value;
    widest = ratio;
  }
  return best;
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
  /** 最近一次 422 的原始 detail：只给下面的入参自适应认字段用，给用户看的那句早截断过了 */
  let lastDetail = "";

  try {
    return await run();
  } catch (e) {
    // 兜底：Token 绝不能出现在错误文案里
    if (e instanceof Error && e.message.includes(token)) {
      e.message = e.message.split(token).join("***");
    }
    throw e;
  }

  /**
   * 撞一次改一次：上游 422 点了哪个入参的名，就改哪个再来，直到它收下为止。
   * 谈成的那版记在模型名下，同一模型后面的请求（包括补第二张）直接照着发。
   */
  async function run(): Promise<string[]> {
    const tuned = MODEL_INPUT.get(model);
    const drop = new Set<string>(tuned?.drop ?? []);
    // 缓存 > 环境变量 > 默认：env 里那个可能正是被模型拒掉的值，谈成过的才最靠谱
    let aspect = tuned?.aspectRatio || process.env.REPLICATE_ASPECT_RATIO?.trim() || DEFAULT_ASPECT;
    /** 自适应换到的比例，只有真换过才写进缓存 */
    let picked = tuned?.aspectRatio;
    let adapted = false;
    // 试过的比例不再试第二遍：detail 里常把刚被拒的那个也一并回显出来
    const tried = new Set<string>();

    for (let retry = 0; ; retry++) {
      tried.add(aspect);
      let started: Prediction;
      try {
        started = await create(aspect, drop);
      } catch (e) {
        // 只有「创建 prediction 时入参被 422 挑了」才谈得上改参数重试，别的错该抛就抛
        const detail = e instanceof CoverError && e.code === "bad_input" ? lastDetail : "";
        if (!detail || retry >= MAX_INPUT_RETRY) throw e;
        const next = detail.includes("aspect_ratio") ? widestAspect(detail, tried) : null;
        const extra = OPTIONAL_INPUT.filter((k) => !drop.has(k) && detail.includes(k));
        // 看不出它嫌的是哪个字段（或挑不出更合适的比例）就别瞎试，按原样报错
        if (!next && extra.length === 0) throw e;
        alive(); // 重试前先看一眼还剩不剩时间、用户还在不在
        if (next) picked = aspect = next;
        for (const key of extra) drop.add(key);
        adapted = true;
        continue;
      }
      // 上游收下了这版入参：改过才值得记，没改过的下次照默认发也一样能成
      if (adapted) MODEL_INPUT.set(model, { aspectRatio: picked, drop });
      const images = await finish(started, n);
      // 张数不够（num_outputs 被摘掉了，或者模型压根只给一张）就再单独生一次补上；
      // 补不上不算整件事失败——有一张也比什么都没有强
      if (images.length < n && Date.now() < deadline && !signal?.aborted) {
        try {
          images.push(...(await finish(await create(aspect, drop), n - images.length)));
        } catch {}
      }
      return images;
    }
  }

  /** 发起一次生成：模型写成 owner/name:hash 时走带版本号的接口，否则用「模型最新版」那个接口 */
  async function create(aspect: string, drop: Set<string>): Promise<Prediction> {
    const input: Record<string, unknown> = {
      prompt: buildPrompt(wanted, style, aspect),
      aspect_ratio: aspect,
      num_outputs: n,
      output_format: "jpg",
      output_quality: 90,
    };
    for (const key of drop) delete input[key];
    const at = model.indexOf(":");
    const url = at > 0 ? `${API_BASE}v1/predictions` : `${API_BASE}v1/models/${model}/predictions`;
    const body = at > 0 ? { version: model.slice(at + 1), input } : { input };
    lastDetail = "";
    // Prefer: wait 让快模型（flux-schnell 几秒就好）在这一次请求里直接返回结果，省掉轮询
    return callApi(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "wait=60" },
      body: JSON.stringify(body),
    });
  }

  /** 等一个 prediction 出结果，再把图片下载成 dataURL；最多取 max 张 */
  async function finish(started: Prediction, max: number): Promise<string[]> {
    let pred = started;
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
    for (const one of outputs.slice(0, max)) images.push(await download(one));
    return images;
  }

  /** 重试前的一道闸：时间用完了、或者用户已经把面板关了，就别再往上游发请求 */
  function alive(): void {
    if (Date.now() >= deadline)
      throw new CoverError("timeout", `生成超时了（超过 ${timeoutSec} 秒），稍后再试`);
    if (signal?.aborted) throw new CoverError("aborted", "已取消");
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
    // 422 的原始 detail 留一份给入参自适应认字段；它不进错误文案，也就不会外泄
    if (!res.ok) {
      lastDetail = res.status === 422 ? String(body?.detail ?? "") : "";
      throw httpError(res.status, body);
    }
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
